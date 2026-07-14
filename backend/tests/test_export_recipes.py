"""Tests for the one-off parquet → JSON recipe export (ADR 0008 migration)."""

from __future__ import annotations

import json
from pathlib import Path

from allaroundfood.models import Ingredient, Quantity, Recipe, Step
from allaroundfood.storage import RecipeStore
from scripts.export_recipes_to_json import export_recipes


def _recipe(recipe_id: str, title: str) -> Recipe:
    return Recipe(
        id=recipe_id,
        title=title,
        ingredients=[Ingredient(name="flour", quantity=Quantity(as_written="2 cups"))],
        steps=[Step(order=1, instruction="Mix.")],
    )


def test_export_writes_json_array(tmp_path: Path) -> None:
    parquet = tmp_path / "recipes.parquet"
    store = RecipeStore.load(parquet).add(_recipe("a", "Bread")).add(_recipe("b", "Soup"))
    store.save()

    out = tmp_path / "recipes.json"
    count = export_recipes(parquet, out)

    assert count == 2
    data = json.loads(out.read_text())
    assert isinstance(data, list) and len(data) == 2
    titles = {r["title"] for r in data}
    assert titles == {"Bread", "Soup"}
    # Round-trips through the pydantic schema (the iOS decode contract).
    for row in data:
        Recipe.model_validate(row)


def test_export_empty_store(tmp_path: Path) -> None:
    out = tmp_path / "recipes.json"
    count = export_recipes(tmp_path / "missing.parquet", out)
    assert count == 0
    assert json.loads(out.read_text()) == []
