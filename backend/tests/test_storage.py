"""Tests for RecipeStore."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from allaroundfood.models import Ingredient, Quantity, Recipe, Step
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
        ingredients=[
            Ingredient(
                name="flour",
                quantity=Quantity(value=2.0, unit="cups", as_written="2 cups"),
            )
        ],
        steps=[Step(order=1, instruction="Mix ingredients")],
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
            Ingredient(
                name="pasta",
                quantity=Quantity(value=1.0, unit="lb", as_written="1 lb"),
            ),
            Ingredient(
                name="tomato sauce",
                quantity=Quantity(
                    value=2.0, unit="cups", as_written="2 cups"
                ),
                notes="fresh",
            ),
        ],
        steps=[
            Step(order=1, instruction="Boil water"),
            Step(order=2, instruction="Cook pasta"),
            Step(order=3, instruction="Add sauce"),
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
        ingredients=[Ingredient(name="ingredient1", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 1")],
    )

    recipe2 = Recipe(
        id="recipe-2",
        title="Recipe 2",
        ingredients=[Ingredient(name="ingredient2", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 2")],
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


def test_full_recipe_round_trip(tmp_path: Path) -> None:
    """Save a fully-populated Recipe with all scalar and nested fields; load and verify."""
    db_path = tmp_path / "full_roundtrip.parquet"

    original_recipe = Recipe(
        id="recipe-full",
        title="Complex Pasta",
        description="A complex pasta recipe with all fields",
        source_url="https://example.com/complex-pasta",
        source_attribution="Chef John",
        prep_time_min=15,
        cook_time_min=30,
        total_time_min=45,
        servings=6,
        yield_text="6 servings",
        ingredients=[
            Ingredient(
                name="pasta",
                quantity=Quantity(value=1.0, unit="lb", as_written="1 lb"),
                preparation="broken in half",
                optional=False,
                group="Pasta",
                notes="Any shape",
            ),
            Ingredient(
                name="garlic",
                quantity=Quantity(value=4.0, unit="cloves", as_written="4 cloves"),
                preparation="minced",
                optional=False,
                group="Sauce",
                notes=None,
            ),
            Ingredient(
                name="red pepper flakes",
                quantity=Quantity(value=0.5, unit="tsp", as_written="½ tsp"),
                preparation=None,
                optional=True,
                group="Sauce",
                notes="adjust to taste",
            ),
        ],
        steps=[
            Step(
                order=1,
                instruction="Boil salted water",
                duration_min=10.0,
                temperature_f=212,
                equipment=["large pot"],
                inline_amounts=["4 quarts"],
            ),
            Step(
                order=2,
                instruction="Cook pasta",
                duration_min=12.0,
                temperature_f=None,
                equipment=["pot"],
                inline_amounts=[],
            ),
            Step(
                order=3,
                instruction="Sauté garlic and pepper",
                duration_min=3.0,
                temperature_f=350,
                equipment=["skillet"],
                inline_amounts=["2 tbsp oil"],
            ),
        ],
        equipment=["pot", "skillet", "colander"],
        cuisine="Italian",
        course="Main",
        dietary_tags=["vegetarian", "gluten-free option"],
        difficulty="medium",
        nutrition=None,
        notes="Best served fresh. Can make ahead and reheat.",
        storage_instructions="Keep in airtight container, refrigerate up to 3 days",
        created_at=datetime(2024, 6, 1, 12, 0, 0, tzinfo=UTC),
        times_made=5,
        parse_confidence=0.95,
    )

    store1 = RecipeStore.load(db_path)
    store2 = store1.add(original_recipe)
    store2.save()

    # Load fresh
    store3 = RecipeStore.load(db_path)
    loaded_recipes = store3.all()

    assert len(loaded_recipes) == 1
    loaded = loaded_recipes[0]

    # Verify all fields match
    assert loaded.model_dump() == original_recipe.model_dump()
    assert loaded.title == "Complex Pasta"
    assert loaded.description == "A complex pasta recipe with all fields"
    assert loaded.prep_time_min == 15
    assert loaded.cook_time_min == 30
    assert loaded.servings == 6
    assert len(loaded.ingredients) == 3
    assert loaded.ingredients[0].name == "pasta"
    assert loaded.ingredients[0].group == "Pasta"
    assert loaded.ingredients[2].optional is True
    assert len(loaded.steps) == 3
    assert loaded.steps[0].temperature_f == 212
    assert loaded.equipment == ["pot", "skillet", "colander"]
    assert loaded.cuisine == "Italian"
    assert "vegetarian" in loaded.dietary_tags
    assert loaded.difficulty == "medium"
    assert loaded.times_made == 5
    assert loaded.parse_confidence == 0.95


def test_backward_compat_old_parquet(tmp_path: Path) -> None:
    """Load an old Phase A parquet (6 columns) and verify new fields are None/defaults."""
    db_path = tmp_path / "old_phase_a.parquet"

    # Synthesize an old-schema parquet with only Phase A columns
    ingredients_json = json.dumps(
        [{"name": "flour", "amount": 2.0, "unit": "cups", "notes": None}]
    )
    steps_json = json.dumps([{"order": 1, "text": "Mix"}])
    old_df = pl.DataFrame(
        {
            "id": ["recipe-old"],
            "title": ["Old Recipe"],
            "source_url": ["https://example.com/old"],
            "ingredients": [ingredients_json],
            "steps": [steps_json],
            "created_at": [datetime(2023, 1, 1, 0, 0, 0, tzinfo=UTC)],
        }
    ).cast({
        "created_at": pl.Datetime("us", "UTC"),
    })
    old_df.write_parquet(db_path)

    # Load with new RecipeStore
    store = RecipeStore.load(db_path)
    recipes = store.all()

    assert len(recipes) == 1
    recipe = recipes[0]

    # Old fields should be loaded
    assert recipe.id == "recipe-old"
    assert recipe.title == "Old Recipe"
    assert recipe.source_url == "https://example.com/old"
    assert len(recipe.ingredients) == 1
    assert recipe.ingredients[0].name == "flour"
    assert len(recipe.steps) == 1
    assert recipe.steps[0].instruction == "Mix"

    # New fields should be None/defaults
    assert recipe.description is None
    assert recipe.source_attribution is None
    assert recipe.prep_time_min is None
    assert recipe.cook_time_min is None
    assert recipe.total_time_min is None
    assert recipe.servings is None
    assert recipe.yield_text is None
    assert recipe.equipment == []
    assert recipe.cuisine is None
    assert recipe.course is None
    assert recipe.dietary_tags == []
    assert recipe.difficulty is None
    assert recipe.nutrition is None
    assert recipe.notes is None
    assert recipe.storage_instructions is None
    assert recipe.times_made == 0
    assert recipe.parse_confidence is None


def test_get_by_id(tmp_path: Path) -> None:
    """Get a recipe by ID; unknown ID returns None."""
    db_path = tmp_path / "get_by_id.parquet"

    recipe1 = Recipe(
        id="recipe-1",
        title="Recipe 1",
        ingredients=[Ingredient(name="ingredient1", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 1")],
    )

    recipe2 = Recipe(
        id="recipe-2",
        title="Recipe 2",
        ingredients=[Ingredient(name="ingredient2", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 2")],
    )

    store = RecipeStore.load(db_path)
    store = store.add(recipe1)
    store = store.add(recipe2)

    # Get existing recipes
    result1 = store.get("recipe-1")
    assert result1 is not None
    assert result1.id == "recipe-1"
    assert result1.title == "Recipe 1"

    result2 = store.get("recipe-2")
    assert result2 is not None
    assert result2.id == "recipe-2"
    assert result2.title == "Recipe 2"

    # Get unknown recipe
    result_unknown = store.get("nonexistent")
    assert result_unknown is None


def test_update_replaces_row(tmp_path: Path) -> None:
    """Update a recipe; the row is replaced with new data."""
    db_path = tmp_path / "update_replace.parquet"

    original_recipe = Recipe(
        id="recipe-1",
        title="Original Title",
        description="Original description",
        ingredients=[Ingredient(name="ingredient1", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 1")],
    )

    store = RecipeStore.load(db_path)
    store = store.add(original_recipe)

    # Update the recipe with a new title
    updated_recipe = original_recipe.model_copy(
        update={"title": "Updated Title", "description": "Updated description"}
    )
    store_updated = store.update("recipe-1", updated_recipe)
    store_updated.save()

    # Load fresh and verify update
    store_loaded = RecipeStore.load(db_path)
    result = store_loaded.get("recipe-1")
    assert result is not None
    assert result.title == "Updated Title"
    assert result.description == "Updated description"
    # Count should be unchanged
    assert len(store_loaded.all()) == 1


def test_update_unknown_id_raises(tmp_path: Path) -> None:
    """Update with unknown ID raises KeyError."""
    db_path = tmp_path / "update_unknown.parquet"

    recipe = Recipe(
        id="recipe-1",
        title="Recipe 1",
        ingredients=[Ingredient(name="ingredient1", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 1")],
    )

    store = RecipeStore.load(db_path)
    store = store.add(recipe)

    # Try to update unknown recipe
    new_recipe = Recipe(
        id="recipe-2",
        title="Recipe 2",
        ingredients=[Ingredient(name="ingredient2", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 2")],
    )

    try:
        store.update("nonexistent", new_recipe)
        raise AssertionError("Expected KeyError")
    except KeyError as e:
        assert str(e) == "'nonexistent'"


def test_update_returns_new_instance(tmp_path: Path) -> None:
    """Update returns a new RecipeStore; original is unchanged (immutability)."""
    db_path = tmp_path / "update_new_instance.parquet"

    recipe = Recipe(
        id="recipe-1",
        title="Original Title",
        ingredients=[Ingredient(name="ingredient1", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="Step 1")],
    )

    store1 = RecipeStore.load(db_path)
    store1 = store1.add(recipe)

    updated_recipe = recipe.model_copy(update={"title": "New Title"})
    store2 = store1.update("recipe-1", updated_recipe)

    # Verify store2 is a different instance
    assert store2 is not store1
    # Verify store1 still has old data
    assert store1.get("recipe-1").title == "Original Title"
    # Verify store2 has new data
    assert store2.get("recipe-1").title == "New Title"
