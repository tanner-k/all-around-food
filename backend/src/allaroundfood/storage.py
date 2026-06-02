"""Immutable Polars-backed recipe storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import polars as pl

from allaroundfood.models import Ingredient, NutritionPerServing, Quantity, Recipe, Step

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
                    "description": pl.Series([], dtype=pl.String),
                    "source_url": pl.Series([], dtype=pl.String),
                    "source_attribution": pl.Series([], dtype=pl.String),
                    "prep_time_min": pl.Series([], dtype=pl.Int64),
                    "cook_time_min": pl.Series([], dtype=pl.Int64),
                    "total_time_min": pl.Series([], dtype=pl.Int64),
                    "servings": pl.Series([], dtype=pl.Int64),
                    "yield_text": pl.Series([], dtype=pl.String),
                    "cuisine": pl.Series([], dtype=pl.String),
                    "course": pl.Series([], dtype=pl.String),
                    "difficulty": pl.Series([], dtype=pl.String),
                    "notes": pl.Series([], dtype=pl.String),
                    "storage_instructions": pl.Series([], dtype=pl.String),
                    "created_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                    "times_made": pl.Series([], dtype=pl.Int64),
                    "parse_confidence": pl.Series([], dtype=pl.Float64),
                    "ingredients": pl.Series([], dtype=pl.String),
                    "steps": pl.Series([], dtype=pl.String),
                    "equipment": pl.Series([], dtype=pl.String),
                    "dietary_tags": pl.Series([], dtype=pl.String),
                    "nutrition": pl.Series([], dtype=pl.String),
                }
            )
        else:
            self._df = df

    @classmethod
    def load(cls, path: Path) -> RecipeStore:
        """Load from parquet; create empty if file doesn't exist.

        Handles backward compatibility: if old Phase A schema is detected,
        adds missing Phase B columns with None/default values.

        Args:
            path: Path to parquet file.

        Returns:
            RecipeStore instance with loaded data or empty store.
        """
        if not path.exists():
            return cls(path)

        df = pl.read_parquet(path)

        # Define all expected Phase B columns
        expected_columns = {
            "id",
            "title",
            "description",
            "source_url",
            "source_attribution",
            "prep_time_min",
            "cook_time_min",
            "total_time_min",
            "servings",
            "yield_text",
            "cuisine",
            "course",
            "difficulty",
            "notes",
            "storage_instructions",
            "created_at",
            "times_made",
            "parse_confidence",
            "ingredients",
            "steps",
            "equipment",
            "dietary_tags",
            "nutrition",
        }

        existing_columns = set(df.columns)
        missing_columns = expected_columns - existing_columns

        # Add missing columns with appropriate defaults
        for col in missing_columns:
            if col in ("description", "source_url", "source_attribution", "yield_text",
                       "cuisine", "course", "difficulty", "notes", "storage_instructions"):
                df = df.with_columns(pl.lit(None, dtype=pl.String).alias(col))
            elif col in ("prep_time_min", "cook_time_min", "total_time_min", "servings"):
                df = df.with_columns(pl.lit(None, dtype=pl.Int64).alias(col))
            elif col == "times_made":
                # times_made defaults to 0, not None
                df = df.with_columns(pl.lit(0, dtype=pl.Int64).alias(col))
            elif col == "parse_confidence":
                df = df.with_columns(pl.lit(None, dtype=pl.Float64).alias(col))
            elif col in ("equipment", "dietary_tags"):
                df = df.with_columns(pl.lit("[]", dtype=pl.String).alias(col))
            elif col == "nutrition":
                df = df.with_columns(pl.lit(None, dtype=pl.String).alias(col))

        return cls(path, df)

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
        equipment_json = json.dumps(recipe.equipment)
        dietary_tags_json = json.dumps(recipe.dietary_tags)
        nutrition_json = json.dumps(recipe.nutrition.model_dump()) if recipe.nutrition else None

        # Create new row
        new_row = pl.DataFrame(
            {
                "id": [recipe.id],
                "title": [recipe.title],
                "description": [recipe.description],
                "source_url": [recipe.source_url],
                "source_attribution": [recipe.source_attribution],
                "prep_time_min": [recipe.prep_time_min],
                "cook_time_min": [recipe.cook_time_min],
                "total_time_min": [recipe.total_time_min],
                "servings": [recipe.servings],
                "yield_text": [recipe.yield_text],
                "cuisine": [recipe.cuisine],
                "course": [recipe.course],
                "difficulty": [recipe.difficulty],
                "notes": [recipe.notes],
                "storage_instructions": [recipe.storage_instructions],
                "created_at": [recipe.created_at],
                "times_made": [recipe.times_made],
                "parse_confidence": [recipe.parse_confidence],
                "ingredients": [ingredients_json],
                "steps": [steps_json],
                "equipment": [equipment_json],
                "dietary_tags": [dietary_tags_json],
                "nutrition": [nutrition_json],
            }
        )

        # Append to existing dataframe (immutably)
        new_df = pl.concat([self._df, new_row])

        # Return new instance with updated dataframe
        return RecipeStore(self._path, new_df)

    def _row_to_recipe(self, row: dict[str, Any]) -> Recipe:
        """Convert a dataframe row (dict) to a Recipe instance.

        Args:
            row: A named row from the dataframe as a dictionary.

        Returns:
            Recipe instance deserialized from the row.
        """
        # Deserialize JSON fields
        ingredients_data = json.loads(row["ingredients"])
        steps_data = json.loads(row["steps"])
        equipment_data = json.loads(row["equipment"]) if row["equipment"] else []
        dietary_tags_data = json.loads(row["dietary_tags"]) if row["dietary_tags"] else []

        # Convert ingredients, handling both old and new formats
        ingredients = []
        for ing in ingredients_data:
            # Handle both new format (with quantity object) and old format (with amount/unit)
            if "quantity" in ing:
                # New format with Quantity object
                quantity = Quantity(**ing["quantity"])
            else:
                # Old format with amount/unit fields - convert to new format
                amount = ing.get("amount", "")
                unit = ing.get("unit", "")
                as_written = ing.get(
                    "as_written", f"{amount} {unit}".strip()
                )
                quantity = Quantity(
                    value=ing.get("amount"),
                    unit=ing.get("unit"),
                    as_written=as_written,
                )

            ingredient = Ingredient(
                name=ing["name"],
                quantity=quantity,
                preparation=ing.get("preparation"),
                optional=ing.get("optional", False),
                group=ing.get("group"),
                notes=ing.get("notes"),
            )
            ingredients.append(ingredient)

        # Convert steps, handling both old and new formats
        steps = []
        for step in steps_data:
            # Handle both new format (instruction) and old format (text)
            instruction = step.get("instruction", step.get("text", ""))

            step_obj = Step(
                order=step["order"],
                instruction=instruction,
                duration_min=step.get("duration_min"),
                temperature_f=step.get("temperature_f"),
                equipment=step.get("equipment", []),
                inline_amounts=step.get("inline_amounts", []),
            )
            steps.append(step_obj)

        nutrition = None
        if row["nutrition"]:
            nutrition_data = json.loads(row["nutrition"])
            nutrition = NutritionPerServing(**nutrition_data)

        recipe = Recipe(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            source_url=row["source_url"],
            source_attribution=row["source_attribution"],
            prep_time_min=row["prep_time_min"],
            cook_time_min=row["cook_time_min"],
            total_time_min=row["total_time_min"],
            servings=row["servings"],
            yield_text=row["yield_text"],
            ingredients=ingredients,
            steps=steps,
            equipment=equipment_data,
            cuisine=row["cuisine"],
            course=row["course"],
            dietary_tags=dietary_tags_data,
            difficulty=row["difficulty"],
            nutrition=nutrition,
            notes=row["notes"],
            storage_instructions=row["storage_instructions"],
            created_at=row["created_at"],
            times_made=row["times_made"],
            parse_confidence=row["parse_confidence"],
        )
        return recipe

    def all(self) -> list[Recipe]:
        """Return all recipes as a list of Recipe instances.

        Returns:
            List of Recipe objects from stored data.
        """
        recipes: list[Recipe] = []

        for row in self._df.iter_rows(named=True):
            recipe = self._row_to_recipe(row)
            recipes.append(recipe)

        return recipes

    def get(self, recipe_id: str) -> Recipe | None:
        """Get a recipe by ID.

        Args:
            recipe_id: The ID of the recipe to retrieve.

        Returns:
            Recipe with matching ID, or None if not found.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == recipe_id:
                return self._row_to_recipe(row)
        return None

    def update(self, recipe_id: str, recipe: Recipe) -> RecipeStore:
        """Return a NEW RecipeStore with the recipe updated.

        Does not mutate self.

        Args:
            recipe_id: The ID of the recipe to update.
            recipe: The updated Recipe object.

        Returns:
            New RecipeStore instance with recipe updated.

        Raises:
            KeyError: If no recipe with recipe_id is found.
        """
        # Check that the recipe exists
        if self.get(recipe_id) is None:
            raise KeyError(recipe_id)

        # Filter out the old row (keep all rows where id != recipe_id)
        new_df = self._df.filter(pl.col("id") != recipe_id)

        # Serialize nested objects to JSON
        ingredients_json = json.dumps(
            [ing.model_dump() for ing in recipe.ingredients]
        )
        steps_json = json.dumps([step.model_dump() for step in recipe.steps])
        equipment_json = json.dumps(recipe.equipment)
        dietary_tags_json = json.dumps(recipe.dietary_tags)
        nutrition_json = json.dumps(recipe.nutrition.model_dump()) if recipe.nutrition else None

        # Create new row
        new_row = pl.DataFrame(
            {
                "id": [recipe.id],
                "title": [recipe.title],
                "description": [recipe.description],
                "source_url": [recipe.source_url],
                "source_attribution": [recipe.source_attribution],
                "prep_time_min": [recipe.prep_time_min],
                "cook_time_min": [recipe.cook_time_min],
                "total_time_min": [recipe.total_time_min],
                "servings": [recipe.servings],
                "yield_text": [recipe.yield_text],
                "cuisine": [recipe.cuisine],
                "course": [recipe.course],
                "difficulty": [recipe.difficulty],
                "notes": [recipe.notes],
                "storage_instructions": [recipe.storage_instructions],
                "created_at": [recipe.created_at],
                "times_made": [recipe.times_made],
                "parse_confidence": [recipe.parse_confidence],
                "ingredients": [ingredients_json],
                "steps": [steps_json],
                "equipment": [equipment_json],
                "dietary_tags": [dietary_tags_json],
                "nutrition": [nutrition_json],
            }
        )

        # Append to the filtered dataframe (immutably)
        updated_df = pl.concat([new_df, new_row])

        # Return new instance with updated dataframe
        return RecipeStore(self._path, updated_df)
