"""Immutable Polars-backed CanonicalProduct repository."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.pricing.models import CanonicalProduct


class CanonicalProductStore:
    """Immutable Polars-backed store for CanonicalProduct records.

    Embedding vectors are persisted as Polars List(Float32) columns.
    Absent embeddings are represented as null in Parquet.
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
                "gtin": pl.Series([], dtype=pl.String),
                "brand": pl.Series([], dtype=pl.String),
                "name": pl.Series([], dtype=pl.String),
                "size_value": pl.Series([], dtype=pl.Float64),
                "size_unit": pl.Series([], dtype=pl.String),
                "category": pl.Series([], dtype=pl.String),
                "attributes": pl.Series([], dtype=pl.String),
                "embedding": pl.Series([], dtype=pl.List(pl.Float32)),
                "created_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "updated_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
            }
        )

    @classmethod
    def load(cls, path: Path) -> CanonicalProductStore:
        """Load from Parquet; return empty store if file missing.

        Args:
            path: Path to the Parquet file.

        Returns:
            CanonicalProductStore loaded from disk or empty.
        """
        if not path.exists():
            return cls(path)
        return cls(path, pl.read_parquet(path))

    def save(self) -> None:
        """Write the current DataFrame to Parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, prod: CanonicalProduct) -> CanonicalProductStore:
        """Return a NEW store with prod appended. Does not mutate self.

        Args:
            prod: CanonicalProduct to append.

        Returns:
            New CanonicalProductStore with the product added.
        """
        embedding_val: list[float] | None = (
            [float(v) for v in prod.embedding] if prod.embedding is not None else None
        )
        new_row = pl.DataFrame(
            {
                "id": pl.Series([prod.id], dtype=pl.String),
                "gtin": pl.Series([prod.gtin], dtype=pl.String),
                "brand": pl.Series([prod.brand], dtype=pl.String),
                "name": pl.Series([prod.name], dtype=pl.String),
                "size_value": pl.Series([prod.size_value], dtype=pl.Float64),
                "size_unit": pl.Series([prod.size_unit], dtype=pl.String),
                "category": pl.Series([prod.category], dtype=pl.String),
                "attributes": pl.Series([json.dumps(prod.attributes)], dtype=pl.String),
                "embedding": pl.Series([embedding_val], dtype=pl.List(pl.Float32)),
                "created_at": pl.Series([prod.created_at], dtype=pl.Datetime("us", "UTC")),
                "updated_at": pl.Series([prod.updated_at], dtype=pl.Datetime("us", "UTC")),
            }
        )
        return CanonicalProductStore(self._path, pl.concat([self._df, new_row]))

    def _row_to_model(self, row: dict[str, Any]) -> CanonicalProduct:
        raw_emb = row["embedding"]
        embedding: list[float] | None = (
            [float(v) for v in raw_emb] if raw_emb is not None else None
        )
        return CanonicalProduct(
            id=row["id"],
            gtin=row["gtin"],
            brand=row["brand"],
            name=row["name"],
            size_value=row["size_value"],
            size_unit=row["size_unit"],
            category=row["category"],
            attributes=json.loads(row["attributes"]) if row["attributes"] else {},
            embedding=embedding,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def all(self) -> list[CanonicalProduct]:
        """Return all canonical products.

        Returns:
            List of CanonicalProduct objects.
        """
        return [self._row_to_model(r) for r in self._df.iter_rows(named=True)]

    def get(self, product_id: str) -> CanonicalProduct | None:
        """Retrieve a canonical product by ID, or None if not found.

        Args:
            product_id: The ID to look up.

        Returns:
            CanonicalProduct if found, else None.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == product_id:
                return self._row_to_model(row)
        return None
