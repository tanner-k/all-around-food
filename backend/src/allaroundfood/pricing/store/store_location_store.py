"""Immutable Polars-backed StoreLocation repository."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.pricing.models import StoreLocation


class StoreLocationStore:
    """Immutable Polars-backed store for StoreLocation records.

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
                "store_id": pl.Series([], dtype=pl.String),
                "name": pl.Series([], dtype=pl.String),
                "address": pl.Series([], dtype=pl.String),
                "zip": pl.Series([], dtype=pl.String),
                "lat": pl.Series([], dtype=pl.Float64),
                "lon": pl.Series([], dtype=pl.Float64),
                "fulfillment_zone": pl.Series([], dtype=pl.String),
                "metadata": pl.Series([], dtype=pl.String),
            }
        )

    @classmethod
    def load(cls, path: Path) -> StoreLocationStore:
        """Load from Parquet; return empty store if file missing.

        Args:
            path: Path to the Parquet file.

        Returns:
            StoreLocationStore loaded from disk or empty.
        """
        if not path.exists():
            return cls(path)
        return cls(path, pl.read_parquet(path))

    def save(self) -> None:
        """Write the current DataFrame to Parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, loc: StoreLocation) -> StoreLocationStore:
        """Return a NEW store with loc appended. Does not mutate self.

        Args:
            loc: StoreLocation to append.

        Returns:
            New StoreLocationStore with the location added.
        """
        new_row = pl.DataFrame(
            {
                "id": [loc.id],
                "retailer": [loc.retailer],
                "store_id": [loc.store_id],
                "name": [loc.name],
                "address": [loc.address],
                "zip": [loc.zip],
                "lat": [loc.lat],
                "lon": [loc.lon],
                "fulfillment_zone": [loc.fulfillment_zone],
                "metadata": [json.dumps(loc.metadata)],
            }
        )
        return StoreLocationStore(self._path, pl.concat([self._df, new_row]))

    def _row_to_model(self, row: dict[str, Any]) -> StoreLocation:
        return StoreLocation(
            id=row["id"],
            retailer=row["retailer"],
            store_id=row["store_id"],
            name=row["name"],
            address=row["address"],
            zip=row["zip"],
            lat=row["lat"],
            lon=row["lon"],
            fulfillment_zone=row["fulfillment_zone"],
            metadata=json.loads(row["metadata"]) if row["metadata"] else {},
        )

    def all(self) -> list[StoreLocation]:
        """Return all locations.

        Returns:
            List of StoreLocation objects.
        """
        return [self._row_to_model(r) for r in self._df.iter_rows(named=True)]

    def get(self, location_id: str) -> StoreLocation | None:
        """Retrieve a location by ID, or None if not found.

        Args:
            location_id: The ID to look up.

        Returns:
            StoreLocation if found, else None.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == location_id:
                return self._row_to_model(row)
        return None
