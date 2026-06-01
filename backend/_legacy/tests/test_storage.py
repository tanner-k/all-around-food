"""Tests for RecipeStore."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from allaroundfood.models import Ingredient, Recipe, Step
from allaroundfood.storage import RecipeStore


def test_load_creates_empty_store_when_file_missing(tmp_path: Path) -> None:
    """Load from a non-existent file creates an empty store."""
    db_path = tmp_path / "nonexistent.parquet"
    store = RecipeStore.load(db_path)
    assert store.all() == []


def test_add_returns_new_instance(tmp_path: Path) -> None:
    """add() returns a new RecipeStore without mutating the original."""
    db_path = tmp_path / "test.parquet"
    store1 = RecipeStore.load(db_path)

    recipe = Recipe(
        id="test-1",
        title="Test Recipe",
        ingredients=[Ingredient(name="flour", amount=2.0, unit="cups")],
        steps=[Step(order=1, text="Mix ingredients")],
    )

    store2 = store1.add(recipe)

    # Verify store2 is a different instance
    assert store2 is not store1
    # Verify store1 was not mutated
    assert store1.all() == []
    # Verify store2 contains the recipe
    assert len(store2.all()) == 1
    assert store2.all()[0].id == "test-1"


def test_round_trip(tmp_path: Path) -> None:
    """Add recipe, save, load fresh, and verify it matches (round-trip test)."""
    db_path = tmp_path / "roundtrip.parquet"

    # Create and save
    original_recipe = Recipe(
        id="recipe-123",
        title="Pasta",
        source_url="https://example.com/recipe",
        ingredients=[
            Ingredient(name="pasta", amount=1.0, unit="lb"),
            Ingredient(name="tomato sauce", amount=2.0, unit="cups", notes="fresh"),
        ],
        steps=[
            Step(order=1, text="Boil water"),
            Step(order=2, text="Cook pasta"),
            Step(order=3, text="Add sauce"),
        ],
        created_at=datetime(2024, 1, 15, 10, 30, 45, tzinfo=UTC),
    )

    store1 = RecipeStore.load(db_path)
    store2 = store1.add(original_recipe)
    store2.save()

    # Load fresh from disk
    store3 = RecipeStore.load(db_path)
    loaded_recipes = store3.all()

    assert len(loaded_recipes) == 1
    loaded = loaded_recipes[0]

    # Compare by model_dump() to handle UTC precision
    assert loaded.model_dump() == original_recipe.model_dump()


def test_multiple_recipes_preserved(tmp_path: Path) -> None:
    """Add two recipes in sequence, save, reload, and verify both are present."""
    db_path = tmp_path / "multiple.parquet"

    recipe1 = Recipe(
        id="recipe-1",
        title="Recipe 1",
        ingredients=[Ingredient(name="ingredient1")],
        steps=[Step(order=1, text="Step 1")],
    )

    recipe2 = Recipe(
        id="recipe-2",
        title="Recipe 2",
        ingredients=[Ingredient(name="ingredient2")],
        steps=[Step(order=1, text="Step 2")],
    )

    store = RecipeStore.load(db_path)
    store = store.add(recipe1)
    store = store.add(recipe2)
    store.save()

    # Load fresh
    store_loaded = RecipeStore.load(db_path)
    recipes = store_loaded.all()

    assert len(recipes) == 2
    assert recipes[0].id == "recipe-1"
    assert recipes[1].id == "recipe-2"
    assert recipes[0].title == "Recipe 1"
    assert recipes[1].title == "Recipe 2"
