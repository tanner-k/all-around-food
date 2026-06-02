"""Immutable Polars-backed RetailerSKU repository."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.pricing.models import RetailerSKU


class RetailerSKUStore:
    """Immutable Polars-backed store for RetailerSKU records.

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
                "canonical_product_id": pl.Series([], dtype=pl.String),
                "retailer": pl.Series([], dtype=pl.String),
                "retailer_sku": pl.Series([], dtype=pl.String),
                "url": pl.Series([], dtype=pl.String),
                "title_raw": pl.Series([], dtype=pl.String),
                "size_raw": pl.Series([], dtype=pl.String),
                "last_seen_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "match_method": pl.Series([], dtype=pl.String),
                "match_confidence": pl.Series([], dtype=pl.Float64),
                "retailer_meta": pl.Series([], dtype=pl.String),
            }
        )

    @classmethod
    def load(cls, path: Path) -> RetailerSKUStore:
        """Load from Parquet; return empty store if file missing.

        Args:
            path: Path to the Parquet file.

        Returns:
            RetailerSKUStore loaded from disk or empty.
        """
        if not path.exists():
            return cls(path)
        return cls(path, pl.read_parquet(path))

    def save(self) -> None:
        """Write the current DataFrame to Parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, sku: RetailerSKU) -> RetailerSKUStore:
        """Return a NEW store with sku appended. Does not mutate self.

        Args:
            sku: RetailerSKU to append.

        Returns:
            New RetailerSKUStore with the SKU added.
        """
        new_row = pl.DataFrame(
            {
                "id": [sku.id],
                "canonical_product_id": [sku.canonical_product_id],
                "retailer": [sku.retailer],
                "retailer_sku": [sku.retailer_sku],
                "url": [sku.url],
                "title_raw": [sku.title_raw],
                "size_raw": [sku.size_raw],
                "last_seen_at": pl.Series([sku.last_seen_at], dtype=pl.Datetime("us", "UTC")),
                "match_method": [sku.match_method],
                "match_confidence": [sku.match_confidence],
                "retailer_meta": [json.dumps(sku.retailer_meta)],
            }
        )
        return RetailerSKUStore(self._path, pl.concat([self._df, new_row]))

    def _row_to_model(self, row: dict[str, Any]) -> RetailerSKU:
        return RetailerSKU(
            id=row["id"],
            canonical_product_id=row["canonical_product_id"],
            retailer=row["retailer"],
            retailer_sku=row["retailer_sku"],
            url=row["url"],
            title_raw=row["title_raw"],
            size_raw=row["size_raw"],
            last_seen_at=row["last_seen_at"],
            match_method=row["match_method"],
            match_confidence=row["match_confidence"],
            retailer_meta=json.loads(row["retailer_meta"]) if row["retailer_meta"] else {},
        )

    def all(self) -> list[RetailerSKU]:
        """Return all retailer SKUs.

        Returns:
            List of RetailerSKU objects.
        """
        return [self._row_to_model(r) for r in self._df.iter_rows(named=True)]

    def get(self, sku_id: str) -> RetailerSKU | None:
        """Retrieve a RetailerSKU by ID, or None if not found.

        Args:
            sku_id: The ID to look up.

        Returns:
            RetailerSKU if found, else None.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == sku_id:
                return self._row_to_model(row)
        return None

    def update(self, id: str, sku: RetailerSKU) -> RetailerSKUStore:
        """Return a NEW store with the matching row replaced. Does not mutate self.

        Args:
            id: The ID of the SKU to replace.
            sku: The updated RetailerSKU object.

        Returns:
            New RetailerSKUStore with the SKU updated.

        Raises:
            KeyError: If no SKU with id is found.
        """
        if self.get(id) is None:
            raise KeyError(id)

        new_df = self._df.filter(pl.col("id") != id)
        new_row = pl.DataFrame(
            {
                "id": [sku.id],
                "canonical_product_id": [sku.canonical_product_id],
                "retailer": [sku.retailer],
                "retailer_sku": [sku.retailer_sku],
                "url": [sku.url],
                "title_raw": [sku.title_raw],
                "size_raw": [sku.size_raw],
                "last_seen_at": pl.Series([sku.last_seen_at], dtype=pl.Datetime("us", "UTC")),
                "match_method": [sku.match_method],
                "match_confidence": [sku.match_confidence],
                "retailer_meta": [json.dumps(sku.retailer_meta)],
            }
        )
        return RetailerSKUStore(self._path, pl.concat([new_df, new_row]))
