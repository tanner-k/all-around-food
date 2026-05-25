"""Price history and promotion detection analytics — pure Polars, no I/O."""

from __future__ import annotations

from datetime import datetime

import polars as pl
from pydantic import BaseModel, ConfigDict


class PromoFlag(BaseModel):
    """A detected promotional price drop for a product at a retailer/location."""

    model_config = ConfigDict(frozen=True)

    canonical_product_id: str
    retailer: str
    store_location_id: str
    baseline_price_cents: float
    drop_price_cents: float
    zscore: float
    observed_at: datetime
    was_marked_promo: bool


def price_history(
    canonical_product_id: str,
    observations_df: pl.DataFrame,
    *,
    retailer: str | None = None,
    store_location_id: str | None = None,
    window_days: int | None = None,
) -> pl.DataFrame:
    """Return historical price rows for a canonical product, sorted by observed_at.

    Args:
        canonical_product_id: The product to retrieve history for.
        observations_df: DataFrame matching PriceObservationStore schema.
        retailer: Optional filter on retailer name.
        store_location_id: Optional filter on store_location_id.
        window_days: If set, only return observations within the last N days
            relative to the most recent observed_at in the data.

    Returns:
        DataFrame with columns: observed_at, retailer, store_location_id,
        price_cents, was_on_promo — sorted by observed_at ascending.
    """
    filtered = observations_df.filter(
        pl.col("canonical_product_id") == canonical_product_id
    )

    if retailer is not None:
        filtered = filtered.filter(pl.col("retailer") == retailer)

    if store_location_id is not None:
        filtered = filtered.filter(pl.col("store_location_id") == store_location_id)

    if window_days is not None and not filtered.is_empty():
        max_ts = filtered.select(pl.col("observed_at").max()).item()
        cutoff = max_ts - pl.duration(days=window_days)
        filtered = filtered.filter(pl.col("observed_at") >= cutoff)

    if filtered.is_empty():
        return pl.DataFrame(
            {
                "observed_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "retailer": pl.Series([], dtype=pl.String),
                "store_location_id": pl.Series([], dtype=pl.String),
                "price_cents": pl.Series([], dtype=pl.Int64),
                "was_on_promo": pl.Series([], dtype=pl.Boolean),
            }
        )

    return filtered.select(
        ["observed_at", "retailer", "store_location_id", "price_cents", "was_on_promo"]
    ).sort("observed_at")


def detect_promotions(
    observations_df: pl.DataFrame,
    *,
    zscore_threshold: float = -1.5,
    baseline_window_days: int = 90,
    detection_window_days: int = 30,
) -> list[PromoFlag]:
    """Detect promotional price drops using z-score statistics per product-retailer group.

    The baseline is computed from observations in the window
    [max_ts - baseline_window_days, max_ts - detection_window_days].
    Each observation in the detection window (last detection_window_days) whose
    z-score falls below zscore_threshold is flagged.

    Args:
        observations_df: DataFrame matching PriceObservationStore schema.
        zscore_threshold: Z-score below which a price is flagged as a promo drop.
        baseline_window_days: Days before detection window to use for baseline stats.
        detection_window_days: Days to scan for drops relative to max observed_at.

    Returns:
        List of PromoFlag objects for all detected promotional drops.
    """
    if observations_df.is_empty():
        return []

    max_ts = observations_df.select(pl.col("observed_at").max()).item()
    detection_cutoff = max_ts - pl.duration(days=detection_window_days)
    baseline_cutoff = max_ts - pl.duration(days=baseline_window_days)

    baseline_df = observations_df.filter(
        (pl.col("observed_at") >= baseline_cutoff)
        & (pl.col("observed_at") < detection_cutoff)
    )

    detection_df = observations_df.filter(pl.col("observed_at") >= detection_cutoff)

    if baseline_df.is_empty() or detection_df.is_empty():
        return []

    # Compute per-group baseline stats
    group_stats = baseline_df.group_by(
        ["canonical_product_id", "retailer", "store_location_id"]
    ).agg(
        [
            pl.col("price_cents").mean().alias("baseline_mean"),
            pl.col("price_cents").std().alias("baseline_std"),
        ]
    )

    # Join detection observations with baseline stats
    detection_with_stats = detection_df.join(
        group_stats,
        on=["canonical_product_id", "retailer", "store_location_id"],
        how="inner",
    ).drop_nulls(subset=["baseline_mean", "baseline_std"])

    if detection_with_stats.is_empty():
        return []

    # Filter out rows where std is zero (constant price — can't z-score)
    detection_with_stats = detection_with_stats.filter(pl.col("baseline_std") > 0)

    if detection_with_stats.is_empty():
        return []

    # Compute z-scores
    with_zscore = detection_with_stats.with_columns(
        (
            (pl.col("price_cents").cast(pl.Float64) - pl.col("baseline_mean"))
            / pl.col("baseline_std")
        ).alias("zscore")
    )

    flagged = with_zscore.filter(pl.col("zscore") < zscore_threshold)

    return [
        PromoFlag(
            canonical_product_id=row["canonical_product_id"],
            retailer=row["retailer"],
            store_location_id=row["store_location_id"],
            baseline_price_cents=float(row["baseline_mean"]),
            drop_price_cents=float(row["price_cents"]),
            zscore=float(row["zscore"]),
            observed_at=row["observed_at"],
            was_marked_promo=bool(row["was_on_promo"]),
        )
        for row in flagged.iter_rows(named=True)
    ]
