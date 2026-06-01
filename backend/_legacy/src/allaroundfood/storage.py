"""Immutable Polars-backed recipe storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import polars as pl

from allaroundfood.models import Ingredient, Recipe, Step

if TYPE_CHECKING:
    pass


class RecipeStore:
    """Immutable Polars-backed recipe store. Persists to a parquet file."""

    def __init__(self, path: Path, df: pl.DataFrame | None = None) -> None:
        """Initialize store with optional dataframe.

        Args:
            path: Path to parquet file.
            df: Polars DataFrame to use. If None, defaults to empty schema.
        """
        self._path = path
        if df is None:
            self._df = pl.DataFrame(
                {
                    "id": pl.Series([], dtype=pl.String),
                    "title": pl.Series([], dtype=pl.String),
                    "source_url": pl.Series([], dtype=pl.String),
                    "ingredients": pl.Series([], dtype=pl.String),
                    "steps": pl.Series([], dtype=pl.String),
                    "created_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                }
            )
        else:
            self._df = df

    @classmethod
    def load(cls, path: Path) -> RecipeStore:
        """Load from parquet; create empty if file doesn't exist.

        Args:
            path: Path to parquet file.

        Returns:
            RecipeStore instance with loaded data or empty store.
        """
        if path.exists():
            df = pl.read_parquet(path)
            return cls(path, df)
        return cls(path)

    def save(self) -> None:
        """Write current dataframe to parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, recipe: Recipe) -> RecipeStore:
        """Return a NEW RecipeStore with the recipe appended.

        Does not mutate self.

        Args:
            recipe: Recipe to add.

        Returns:
            New RecipeStore instance with recipe appended.
        """
        # Serialize nested objects to JSON
        ingredients_json = json.dumps(
            [ing.model_dump() for ing in recipe.ingredients]
        )
        steps_json = json.dumps([step.model_dump() for step in recipe.steps])

        # Create new row
        new_row = pl.DataFrame(
            {
                "id": [recipe.id],
                "title": [recipe.title],
                "source_url": [recipe.source_url],
                "ingredients": [ingredients_json],
                "steps": [steps_json],
                "created_at": [recipe.created_at],
            }
        )

        # Append to existing dataframe (immutably)
        new_df = pl.concat([self._df, new_row])

        # Return new instance with updated dataframe
        return RecipeStore(self._path, new_df)

    def all(self) -> list[Recipe]:
        """Return all recipes as a list of Recipe instances.

        Returns:
            List of Recipe objects from stored data.
        """
        recipes: list[Recipe] = []

        for row in self._df.iter_rows(named=True):
            # Deserialize JSON fields
            ingredients_data = json.loads(row["ingredients"])
            steps_data = json.loads(row["steps"])

            ingredients = [Ingredient(**ing) for ing in ingredients_data]
            steps = [Step(**step) for step in steps_data]

            recipe = Recipe(
                id=row["id"],
                title=row["title"],
                source_url=row["source_url"],
                ingredients=ingredients,
                steps=steps,
                created_at=row["created_at"],
            )
            recipes.append(recipe)

        return recipes
