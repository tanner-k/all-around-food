"""Immutable Polars-backed PriceObservation repository.

Append-only optimised: add() builds a new store by concatenating a single-row
DataFrame. Partitioning by retailer/yyyy-mm is deferred to Phase 7.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.pricing.models import PriceObservation


class PriceObservationStore:
    """Immutable Polars-backed store for PriceObservation records.

    Persists to a Parquet file. All mutation methods return new instances.
    """

    def __init__(self, path: Path, df: pl.DataFrame | None = None) -> None:
        """Initialise with a path and optional DataFrame.

        Args:
            path: Path to the Parquet file.
            df: Polars DataFrame. Defaults to empty schema when None.
        """
        self._path = path
        self._df = df if df is not None else self._empty_df()

    @staticmethod
    def _empty_df() -> pl.DataFrame:
        return pl.DataFrame(
            {
                "id": pl.Series([], dtype=pl.String),
                "retailer": pl.Series([], dtype=pl.String),
                "store_location_id": pl.Series([], dtype=pl.String),
                "retailer_sku_id": pl.Series([], dtype=pl.String),
                "canonical_product_id": pl.Series([], dtype=pl.String),
                "price_cents": pl.Series([], dtype=pl.Int64),
                "unit_price_cents": pl.Series([], dtype=pl.Int64),
                "was_on_promo": pl.Series([], dtype=pl.Boolean),
                "promo_text": pl.Series([], dtype=pl.String),
                "promo_price_cents": pl.Series([], dtype=pl.Int64),
                "currency": pl.Series([], dtype=pl.String),
                "observed_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "source_tier": pl.Series([], dtype=pl.String),
                "raw_response_hash": pl.Series([], dtype=pl.String),
            }
        )

    @classmethod
    def load(cls, path: Path) -> PriceObservationStore:
        """Load from Parquet; return empty store if file missing.

        Args:
            path: Path to the Parquet file.

        Returns:
            PriceObservationStore loaded from disk or empty.
        """
        if not path.exists():
            return cls(path)
        return cls(path, pl.read_parquet(path))

    def save(self) -> None:
        """Write the current DataFrame to Parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, obs: PriceObservation) -> PriceObservationStore:
        """Return a NEW store with obs appended. Does not mutate self.

        Args:
            obs: PriceObservation to append.

        Returns:
            New PriceObservationStore with the observation added.
        """
        new_row = pl.DataFrame(
            {
                "id": pl.Series([obs.id], dtype=pl.String),
                "retailer": pl.Series([obs.retailer], dtype=pl.String),
                "store_location_id": pl.Series([obs.store_location_id], dtype=pl.String),
                "retailer_sku_id": pl.Series([obs.retailer_sku_id], dtype=pl.String),
                "canonical_product_id": pl.Series([obs.canonical_product_id], dtype=pl.String),
                "price_cents": pl.Series([obs.price_cents], dtype=pl.Int64),
                "unit_price_cents": pl.Series([obs.unit_price_cents], dtype=pl.Int64),
                "was_on_promo": pl.Series([obs.was_on_promo], dtype=pl.Boolean),
                "promo_text": pl.Series([obs.promo_text], dtype=pl.String),
                "promo_price_cents": pl.Series([obs.promo_price_cents], dtype=pl.Int64),
                "currency": pl.Series([obs.currency], dtype=pl.String),
                "observed_at": pl.Series([obs.observed_at], dtype=pl.Datetime("us", "UTC")),
                "source_tier": pl.Series([obs.source_tier], dtype=pl.String),
                "raw_response_hash": pl.Series([obs.raw_response_hash], dtype=pl.String),
            }
        )
        return PriceObservationStore(self._path, pl.concat([self._df, new_row]))

    def _row_to_model(self, row: dict[str, Any]) -> PriceObservation:
        return PriceObservation(
            id=row["id"],
            retailer=row["retailer"],
            store_location_id=row["store_location_id"],
            retailer_sku_id=row["retailer_sku_id"],
            canonical_product_id=row["canonical_product_id"],
            price_cents=row["price_cents"],
            unit_price_cents=row["unit_price_cents"],
            was_on_promo=row["was_on_promo"],
            promo_text=row["promo_text"],
            promo_price_cents=row["promo_price_cents"],
            currency=row["currency"],
            observed_at=row["observed_at"],
            source_tier=row["source_tier"],
            raw_response_hash=row["raw_response_hash"],
        )

    def all(self) -> list[PriceObservation]:
        """Return all price observations.

        Returns:
            List of PriceObservation objects.
        """
        return [self._row_to_model(r) for r in self._df.iter_rows(named=True)]

    def get(self, observation_id: str) -> PriceObservation | None:
        """Retrieve a PriceObservation by ID, or None if not found.

        Args:
            observation_id: The ID to look up.

        Returns:
            PriceObservation if found, else None.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == observation_id:
                return self._row_to_model(row)
        return None

    def update(self, id: str, observation: PriceObservation) -> PriceObservationStore:
        """Return a NEW store with the matching row replaced. Does not mutate self.

        Args:
            id: The ID of the observation to replace.
            observation: The updated PriceObservation object.

        Returns:
            New PriceObservationStore with the observation updated.

        Raises:
            KeyError: If no observation with id is found.
        """
        if self.get(id) is None:
            raise KeyError(id)

        new_df = self._df.filter(pl.col("id") != id)
        new_row = pl.DataFrame(
            {
                "id": pl.Series([observation.id], dtype=pl.String),
                "retailer": pl.Series([observation.retailer], dtype=pl.String),
                "store_location_id": pl.Series([observation.store_location_id], dtype=pl.String),
                "retailer_sku_id": pl.Series([observation.retailer_sku_id], dtype=pl.String),
                "canonical_product_id": pl.Series(
                    [observation.canonical_product_id], dtype=pl.String
                ),
                "price_cents": pl.Series([observation.price_cents], dtype=pl.Int64),
                "unit_price_cents": pl.Series([observation.unit_price_cents], dtype=pl.Int64),
                "was_on_promo": pl.Series([observation.was_on_promo], dtype=pl.Boolean),
                "promo_text": pl.Series([observation.promo_text], dtype=pl.String),
                "promo_price_cents": pl.Series([observation.promo_price_cents], dtype=pl.Int64),
                "currency": pl.Series([observation.currency], dtype=pl.String),
                "observed_at": pl.Series([observation.observed_at], dtype=pl.Datetime("us", "UTC")),
                "source_tier": pl.Series([observation.source_tier], dtype=pl.String),
                "raw_response_hash": pl.Series([observation.raw_response_hash], dtype=pl.String),
            }
        )
        return PriceObservationStore(self._path, pl.concat([new_df, new_row]))
