"""Immutable Polars-backed pantry storage."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.models import PantryItem
from allaroundfood.naming import normalize_name

_COLUMNS: dict[str, pl.DataType] = {
    "id": pl.String(),
    "name": pl.String(),
    "status": pl.String(),
    "aisle": pl.String(),
    "aisle_overridden": pl.Boolean(),
    "notes": pl.String(),
    "created_at": pl.Datetime("us", "UTC"),
    "updated_at": pl.Datetime("us", "UTC"),
}


class PantryStore:
    """Immutable Polars-backed pantry store. Persists to a parquet file."""

    def __init__(self, path: Path, df: pl.DataFrame | None = None) -> None:
        """Initialize store with optional dataframe.

        Args:
            path: Path to parquet file.
            df: Polars DataFrame to use. If None, defaults to empty schema.
        """
        self._path = path
        if df is None:
            self._df = pl.DataFrame(
                {col: pl.Series([], dtype=dtype) for col, dtype in _COLUMNS.items()}
            )
        else:
            self._df = df

    @classmethod
    def load(cls, path: Path) -> PantryStore:
        """Load from parquet; create empty if the file doesn't exist.

        Missing columns are added with sensible defaults (additive migration).

        Args:
            path: Path to parquet file.

        Returns:
            PantryStore instance with loaded data or an empty store.
        """
        if not path.exists():
            return cls(path)

        df = pl.read_parquet(path)
        for col, dtype in _COLUMNS.items():
            if col not in df.columns:
                default: Any = None
                if dtype == pl.Boolean():
                    default = False
                elif isinstance(dtype, pl.Datetime):
                    default = datetime.now(UTC)
                df = df.with_columns(pl.lit(default, dtype=dtype).alias(col))
        return cls(path, df.select(list(_COLUMNS)))

    def save(self) -> None:
        """Write the current dataframe to parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    @staticmethod
    def _to_row(item: PantryItem) -> dict[str, Any]:
        """Build a single-row column mapping from a PantryItem."""
        return {
            "id": [item.id],
            "name": [item.name],
            "status": [item.status],
            "aisle": [item.aisle],
            "aisle_overridden": [item.aisle_overridden],
            "notes": [item.notes],
            "created_at": [item.created_at],
            "updated_at": [item.updated_at],
        }

    def _new_row(self, item: PantryItem) -> pl.DataFrame:
        """Build a single-row DataFrame matching the store schema."""
        return pl.DataFrame(self._to_row(item)).cast(dict(_COLUMNS))  # type: ignore[arg-type]

    def add(self, item: PantryItem) -> PantryStore:
        """Return a NEW PantryStore with the item appended. Does not mutate self.

        Args:
            item: PantryItem to add.

        Returns:
            New PantryStore instance with the item appended.
        """
        new_df = pl.concat([self._df, self._new_row(item)])
        return PantryStore(self._path, new_df)

    def update(self, item_id: str, item: PantryItem) -> PantryStore:
        """Return a NEW PantryStore with the item updated. Does not mutate self.

        Args:
            item_id: The ID of the item to update.
            item: The updated PantryItem.

        Returns:
            New PantryStore instance with the item updated.

        Raises:
            KeyError: If no item with item_id is found.
        """
        if self.get(item_id) is None:
            raise KeyError(item_id)
        kept = self._df.filter(pl.col("id") != item_id)
        return PantryStore(self._path, pl.concat([kept, self._new_row(item)]))

    def delete(self, item_id: str) -> PantryStore:
        """Return a NEW PantryStore with the item removed. Does not mutate self.

        Args:
            item_id: The ID of the item to remove.

        Returns:
            New PantryStore instance without the item.

        Raises:
            KeyError: If no item with item_id is found.
        """
        if self.get(item_id) is None:
            raise KeyError(item_id)
        return PantryStore(self._path, self._df.filter(pl.col("id") != item_id))

    def upsert_by_name(self, item: PantryItem) -> PantryStore:
        """Return a NEW PantryStore with the item added or updated by name.

        If an item with the same normalized name already exists, it is
        updated in place (keeping the existing id); otherwise the item is
        appended. Used so a re-uploaded receipt doesn't create duplicates.

        Args:
            item: The PantryItem to upsert.

        Returns:
            New PantryStore instance with the upserted item.
        """
        existing = self.get_by_name(item.name)
        if existing is None:
            return self.add(item)
        merged = item.model_copy(update={"id": existing.id})
        return self.update(existing.id, merged)

    @staticmethod
    def _row_to_item(row: dict[str, Any]) -> PantryItem:
        """Convert a dataframe row (dict) to a PantryItem instance."""
        return PantryItem(
            id=row["id"],
            name=row["name"],
            status=row["status"],
            aisle=row["aisle"],
            aisle_overridden=row["aisle_overridden"],
            notes=row["notes"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def all(self) -> list[PantryItem]:
        """Return all pantry items.

        Returns:
            List of PantryItem objects from stored data.
        """
        return [self._row_to_item(row) for row in self._df.iter_rows(named=True)]

    def get(self, item_id: str) -> PantryItem | None:
        """Get a pantry item by ID.

        Args:
            item_id: The ID of the item to retrieve.

        Returns:
            PantryItem with matching ID, or None if not found.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == item_id:
                return self._row_to_item(row)
        return None

    def get_by_name(self, name: str) -> PantryItem | None:
        """Get a pantry item by name (case-insensitive, normalized).

        Args:
            name: The item name to look up.

        Returns:
            The first PantryItem with a matching normalized name, or None.
        """
        target = normalize_name(name)
        for row in self._df.iter_rows(named=True):
            if normalize_name(row["name"]) == target:
                return self._row_to_item(row)
        return None
