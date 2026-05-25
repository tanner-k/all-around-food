"""Price-per-unit analytics — pure Polars functions, no I/O.

Converts raw price observations into per-unit-normalized comparisons.
"""

from __future__ import annotations

from datetime import datetime

import polars as pl
from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Unit normalization
# ---------------------------------------------------------------------------

# Canonical unit per family
_CANONICAL_UNIT: dict[str, str] = {
    # weight → oz
    "oz": "oz",
    "lb": "oz",
    "g": "oz",
    "kg": "oz",
    # volume → fl_oz
    "fl_oz": "fl_oz",
    "ml": "fl_oz",
    "l": "fl_oz",
    # count → ct
    "ct": "ct",
    "count": "ct",
    "ea": "ct",
    "each": "ct",
    "pk": "ct",
    "pack": "ct",
}

# Conversion factors: multiply size_value by this to get the canonical unit
_TO_CANONICAL: dict[str, float] = {
    "oz": 1.0,
    "lb": 16.0,
    "g": 1.0 / 28.3495,
    "kg": 1000.0 / 28.3495,
    "fl_oz": 1.0,
    "ml": 1.0 / 29.5735,
    "l": 1000.0 / 29.5735,
    "ct": 1.0,
    "count": 1.0,
    "ea": 1.0,
    "each": 1.0,
    "pk": 1.0,
    "pack": 1.0,
}


def normalize_size(size_value: float, size_unit: str) -> tuple[float, str] | None:
    """Convert size_value/size_unit to the canonical unit for that unit family.

    Args:
        size_value: Numeric size from the product record.
        size_unit: Unit string (case-insensitive).

    Returns:
        Tuple of (normalized_value, canonical_unit) or None for unknown units.
    """
    unit_lower = size_unit.strip().lower()
    if unit_lower not in _CANONICAL_UNIT:
        return None
    canonical = _CANONICAL_UNIT[unit_lower]
    factor = _TO_CANONICAL[unit_lower]
    return (size_value * factor, canonical)


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------


class PricePerUnit(BaseModel):
    """Price-per-unit result for one (canonical, retailer, store_location) tuple."""

    model_config = ConfigDict(frozen=True)

    canonical_product_id: str
    retailer: str
    store_location_id: str
    price_cents: int
    normalized_size: float
    normalized_unit: str
    price_per_unit_cents: float
    observed_at: datetime


# ---------------------------------------------------------------------------
# Analytics functions
# ---------------------------------------------------------------------------


def compute_price_per_unit(
    observations_df: pl.DataFrame,
    canonical_df: pl.DataFrame,
) -> pl.DataFrame:
    """Join observations with canonical products and compute price per unit.

    Only rows where both size_value and size_unit are present and the unit is
    in a known family are included in the output.

    Args:
        observations_df: DataFrame with schema matching PriceObservationStore.
        canonical_df: DataFrame with schema matching CanonicalProductStore
            (must include size_value, size_unit columns).

    Returns:
        DataFrame with columns:
            canonical_product_id, retailer, store_location_id, price_cents,
            normalized_size, normalized_unit, price_per_unit_cents, observed_at.
    """
    # Select only the columns we need from canonical to avoid collisions
    canonical_slim = canonical_df.select(
        [
            pl.col("id").alias("canonical_product_id"),
            pl.col("size_value"),
            pl.col("size_unit"),
        ]
    ).drop_nulls(subset=["size_value", "size_unit"])

    joined = observations_df.join(
        canonical_slim,
        on="canonical_product_id",
        how="inner",
    )

    if joined.is_empty():
        return pl.DataFrame(
            {
                "canonical_product_id": pl.Series([], dtype=pl.String),
                "retailer": pl.Series([], dtype=pl.String),
                "store_location_id": pl.Series([], dtype=pl.String),
                "price_cents": pl.Series([], dtype=pl.Int64),
                "normalized_size": pl.Series([], dtype=pl.Float64),
                "normalized_unit": pl.Series([], dtype=pl.String),
                "price_per_unit_cents": pl.Series([], dtype=pl.Float64),
                "observed_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
            }
        )

    # Apply normalize_size row-by-row (Polars user-defined functions are slow
    # for complex logic; we keep it simple with map_rows on a slim df)
    rows = joined.select(["size_value", "size_unit"]).to_dicts()
    norm_sizes: list[float | None] = []
    norm_units: list[str | None] = []
    for r in rows:
        norm_result = normalize_size(float(r["size_value"]), str(r["size_unit"]))
        if norm_result is None:
            norm_sizes.append(None)
            norm_units.append(None)
        else:
            norm_sizes.append(norm_result[0])
            norm_units.append(norm_result[1])

    augmented = joined.with_columns(
        [
            pl.Series("normalized_size", norm_sizes, dtype=pl.Float64),
            pl.Series("normalized_unit", norm_units, dtype=pl.String),
        ]
    ).drop_nulls(subset=["normalized_size", "normalized_unit"])

    if augmented.is_empty():
        return pl.DataFrame(
            {
                "canonical_product_id": pl.Series([], dtype=pl.String),
                "retailer": pl.Series([], dtype=pl.String),
                "store_location_id": pl.Series([], dtype=pl.String),
                "price_cents": pl.Series([], dtype=pl.Int64),
                "normalized_size": pl.Series([], dtype=pl.Float64),
                "normalized_unit": pl.Series([], dtype=pl.String),
                "price_per_unit_cents": pl.Series([], dtype=pl.Float64),
                "observed_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
            }
        )

    result = augmented.with_columns(
        (pl.col("price_cents").cast(pl.Float64) / pl.col("normalized_size")).alias(
            "price_per_unit_cents"
        )
    ).select(
        [
            "canonical_product_id",
            "retailer",
            "store_location_id",
            "price_cents",
            "normalized_size",
            "normalized_unit",
            "price_per_unit_cents",
            "observed_at",
        ]
    )

    return result


def latest_price_per_unit(
    observations_df: pl.DataFrame,
    canonical_df: pl.DataFrame,
) -> list[PricePerUnit]:
    """Return one PricePerUnit per (canonical, retailer, store_location) — most recent.

    Args:
        observations_df: DataFrame with schema matching PriceObservationStore.
        canonical_df: DataFrame with schema matching CanonicalProductStore.

    Returns:
        List of PricePerUnit with the most recent observation per group.
    """
    ppu_df = compute_price_per_unit(observations_df, canonical_df)
    if ppu_df.is_empty():
        return []

    # Pick the row with max observed_at per group
    latest = (
        ppu_df.sort("observed_at", descending=True)
        .group_by(["canonical_product_id", "retailer", "store_location_id"])
        .first()
    )

    return [
        PricePerUnit(
            canonical_product_id=row["canonical_product_id"],
            retailer=row["retailer"],
            store_location_id=row["store_location_id"],
            price_cents=int(row["price_cents"]),
            normalized_size=float(row["normalized_size"]),
            normalized_unit=row["normalized_unit"],
            price_per_unit_cents=float(row["price_per_unit_cents"]),
            observed_at=row["observed_at"],
        )
        for row in latest.iter_rows(named=True)
    ]
