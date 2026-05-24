"""Immutable Polars-backed shopping-list storage."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.models import ShoppingListItem

_COLUMNS: dict[str, pl.DataType] = {
    "id": pl.String(),
    "name": pl.String(),
    "quantity_text": pl.String(),
    "aisle": pl.String(),
    "checked": pl.Boolean(),
    "source": pl.String(),
    "source_recipe_id": pl.String(),
    "pantry_covered": pl.Boolean(),
    "pantry_low": pl.Boolean(),
    "created_at": pl.Datetime("us", "UTC"),
}

# Defaults for non-nullable string columns when migrating an older parquet.
_MIGRATION_DEFAULTS: dict[str, str] = {"aisle": "Other", "source": "manual"}


class ShoppingListStore:
    """Immutable Polars-backed shopping-list store. Persists to a parquet file."""

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
    def load(cls, path: Path) -> ShoppingListStore:
        """Load from parquet; create empty if the file doesn't exist.

        Missing columns are added with sensible defaults (additive migration).

        Args:
            path: Path to parquet file.

        Returns:
            ShoppingListStore instance with loaded data or an empty store.
        """
        if not path.exists():
            return cls(path)

        df = pl.read_parquet(path)
        for col, dtype in _COLUMNS.items():
            if col not in df.columns:
                default: Any = _MIGRATION_DEFAULTS.get(col)
                if default is None:
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
    def _new_row(item: ShoppingListItem) -> pl.DataFrame:
        """Build a single-row DataFrame matching the store schema."""
        return pl.DataFrame(
            {
                "id": [item.id],
                "name": [item.name],
                "quantity_text": [item.quantity_text],
                "aisle": [item.aisle],
                "checked": [item.checked],
                "source": [item.source],
                "source_recipe_id": [item.source_recipe_id],
                "pantry_covered": [item.pantry_covered],
                "pantry_low": [item.pantry_low],
                "created_at": [item.created_at],
            }
        ).cast(dict(_COLUMNS))  # type: ignore[arg-type]

    def add(self, item: ShoppingListItem) -> ShoppingListStore:
        """Return a NEW store with the item appended. Does not mutate self.

        Args:
            item: ShoppingListItem to add.

        Returns:
            New ShoppingListStore instance with the item appended.
        """
        return ShoppingListStore(
            self._path, pl.concat([self._df, self._new_row(item)])
        )

    def update(self, item_id: str, item: ShoppingListItem) -> ShoppingListStore:
        """Return a NEW store with the item updated. Does not mutate self.

        Args:
            item_id: The ID of the item to update.
            item: The updated ShoppingListItem.

        Returns:
            New ShoppingListStore instance with the item updated.

        Raises:
            KeyError: If no item with item_id is found.
        """
        if self.get(item_id) is None:
            raise KeyError(item_id)
        kept = self._df.filter(pl.col("id") != item_id)
        return ShoppingListStore(self._path, pl.concat([kept, self._new_row(item)]))

    def delete(self, item_id: str) -> ShoppingListStore:
        """Return a NEW store with the item removed. Does not mutate self.

        Args:
            item_id: The ID of the item to remove.

        Returns:
            New ShoppingListStore instance without the item.

        Raises:
            KeyError: If no item with item_id is found.
        """
        if self.get(item_id) is None:
            raise KeyError(item_id)
        return ShoppingListStore(
            self._path, self._df.filter(pl.col("id") != item_id)
        )

    def replace_recipe_items(
        self, items: list[ShoppingListItem]
    ) -> ShoppingListStore:
        """Return a NEW store with all recipe-sourced rows swapped.

        Removes every row whose ``source == "recipe"`` and appends the
        supplied items. Manual and planner rows are left untouched, so
        re-generating from recipes doesn't pile up duplicates.

        Args:
            items: The new recipe-sourced items.

        Returns:
            New ShoppingListStore instance.
        """
        kept = self._df.filter(pl.col("source") != "recipe")
        rows = [self._new_row(item) for item in items]
        return ShoppingListStore(self._path, pl.concat([kept, *rows]))

    def clear_checked(self) -> ShoppingListStore:
        """Return a NEW store with all checked rows removed.

        Returns:
            New ShoppingListStore instance without checked items.
        """
        return ShoppingListStore(self._path, self._df.filter(~pl.col("checked")))

    def clear_all(self) -> ShoppingListStore:
        """Return a NEW, empty store. Does not mutate self.

        Returns:
            New ShoppingListStore instance with no items.
        """
        return ShoppingListStore(self._path)

    @staticmethod
    def _row_to_item(row: dict[str, Any]) -> ShoppingListItem:
        """Convert a dataframe row (dict) to a ShoppingListItem instance."""
        return ShoppingListItem(
            id=row["id"],
            name=row["name"],
            quantity_text=row["quantity_text"],
            aisle=row["aisle"],
            checked=row["checked"],
            source=row["source"],
            source_recipe_id=row["source_recipe_id"],
            pantry_covered=row["pantry_covered"],
            pantry_low=row["pantry_low"],
            created_at=row["created_at"],
        )

    def all(self) -> list[ShoppingListItem]:
        """Return all shopping-list items.

        Returns:
            List of ShoppingListItem objects from stored data.
        """
        return [self._row_to_item(row) for row in self._df.iter_rows(named=True)]

    def get(self, item_id: str) -> ShoppingListItem | None:
        """Get a shopping-list item by ID.

        Args:
            item_id: The ID of the item to retrieve.

        Returns:
            ShoppingListItem with matching ID, or None if not found.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == item_id:
                return self._row_to_item(row)
        return None
