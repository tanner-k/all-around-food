"""Immutable Polars-backed weekly meal-plan storage."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.models import MealPlan, PlannedMeal

_COLUMNS: dict[str, pl.DataType] = {
    "week_of": pl.String(),
    "meals": pl.String(),  # JSON-encoded list[PlannedMeal]
    "updated_at": pl.Datetime("us", "UTC"),
}


class MealPlanStore:
    """Immutable Polars-backed meal-plan store. One row per week."""

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
    def load(cls, path: Path) -> MealPlanStore:
        """Load from parquet; create empty if the file doesn't exist.

        Missing columns are added with sensible defaults (additive migration).

        Args:
            path: Path to parquet file.

        Returns:
            MealPlanStore instance with loaded data or an empty store.
        """
        if not path.exists():
            return cls(path)

        df = pl.read_parquet(path)
        for col, dtype in _COLUMNS.items():
            if col not in df.columns:
                default: Any = None
                if isinstance(dtype, pl.Datetime):
                    default = datetime.now(UTC)
                df = df.with_columns(pl.lit(default, dtype=dtype).alias(col))
        return cls(path, df.select(list(_COLUMNS)))

    def save(self) -> None:
        """Write the current dataframe to parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    @staticmethod
    def _new_row(plan: MealPlan) -> pl.DataFrame:
        """Build a single-row DataFrame matching the store schema."""
        meals_json = json.dumps([meal.model_dump() for meal in plan.meals])
        return pl.DataFrame(
            {
                "week_of": [plan.week_of],
                "meals": [meals_json],
                "updated_at": [plan.updated_at],
            }
        ).cast(dict(_COLUMNS))  # type: ignore[arg-type]

    def upsert(self, plan: MealPlan) -> MealPlanStore:
        """Return a NEW store with the plan added or replaced by week.

        If a plan for the same ``week_of`` already exists it is replaced;
        otherwise the plan is appended. Does not mutate self.

        Args:
            plan: The meal plan to store.

        Returns:
            New MealPlanStore instance with the plan upserted.
        """
        kept = self._df.filter(pl.col("week_of") != plan.week_of)
        return MealPlanStore(self._path, pl.concat([kept, self._new_row(plan)]))

    @staticmethod
    def _row_to_plan(row: dict[str, Any]) -> MealPlan:
        """Convert a dataframe row (dict) to a MealPlan instance."""
        meals = [PlannedMeal(**m) for m in json.loads(row["meals"])]
        return MealPlan(
            week_of=row["week_of"],
            meals=meals,
            updated_at=row["updated_at"],
        )

    def all(self) -> list[MealPlan]:
        """Return all stored meal plans.

        Returns:
            List of MealPlan objects from stored data.
        """
        return [self._row_to_plan(row) for row in self._df.iter_rows(named=True)]

    def get(self, week_of: str) -> MealPlan | None:
        """Get the meal plan for a given week.

        Args:
            week_of: ISO date of the week's Monday.

        Returns:
            MealPlan for that week, or None if not found.
        """
        for row in self._df.iter_rows(named=True):
            if row["week_of"] == week_of:
                return self._row_to_plan(row)
        return None
