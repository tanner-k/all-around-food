"""Tests for smart shopping-list logic."""

from __future__ import annotations

from allaroundfood.models import (
    Ingredient,
    PantryItem,
    Quantity,
    Recipe,
    ShoppingListItem,
    Step,
)
from allaroundfood.shopping_logic import (
    aggregate_recipe_ingredients,
    build_shopping_list_response,
    compute_pantry_flags,
    recompute_all_flags,
)


def _ingredient(name: str, as_written: str, *, optional: bool = False) -> Ingredient:
    """Build an Ingredient for tests."""
    return Ingredient(
        name=name,
        quantity=Quantity(as_written=as_written),
        optional=optional,
    )


def _recipe(recipe_id: str, ingredients: list[Ingredient]) -> Recipe:
    """Build a Recipe for tests."""
    return Recipe(
        id=recipe_id,
        title=f"Recipe {recipe_id}",
        ingredients=ingredients,
        steps=[Step(order=1, instruction="Cook")],
    )


def _pantry(name: str, status: str) -> PantryItem:
    """Build a PantryItem for tests."""
    return PantryItem(id=f"p-{name}", name=name, status=status)  # type: ignore[arg-type]


def _shopping(name: str) -> ShoppingListItem:
    """Build a ShoppingListItem for tests."""
    return ShoppingListItem(id=f"s-{name}", name=name)


# --- compute_pantry_flags ---


def test_in_stock_pantry_match_marks_covered() -> None:
    """An in_stock pantry match marks the item covered."""
    result = compute_pantry_flags(
        _shopping("milk"), {"milk": _pantry("milk", "in_stock")}
    )
    assert result.pantry_covered is True
    assert result.pantry_low is False


def test_low_pantry_match_marks_low() -> None:
    """A low pantry match flags the item without hiding it."""
    result = compute_pantry_flags(
        _shopping("milk"), {"milk": _pantry("milk", "low")}
    )
    assert result.pantry_covered is False
    assert result.pantry_low is True


def test_out_pantry_match_leaves_item_to_buy() -> None:
    """An out pantry match leaves both flags false (still buy it)."""
    result = compute_pantry_flags(
        _shopping("milk"), {"milk": _pantry("milk", "out")}
    )
    assert result.pantry_covered is False
    assert result.pantry_low is False


def test_no_pantry_match_leaves_item_to_buy() -> None:
    """No pantry match leaves both flags false."""
    result = compute_pantry_flags(_shopping("milk"), {})
    assert result.pantry_covered is False
    assert result.pantry_low is False


def test_recompute_all_flags() -> None:
    """recompute_all_flags refreshes flags for every item."""
    items = [_shopping("milk"), _shopping("eggs")]
    pantry = [_pantry("milk", "in_stock")]
    result = recompute_all_flags(items, pantry)

    by_name = {i.name: i for i in result}
    assert by_name["milk"].pantry_covered is True
    assert by_name["eggs"].pantry_covered is False


# --- aggregate_recipe_ingredients ---


def test_aggregate_dedupes_shared_ingredient() -> None:
    """A shared ingredient collapses to a single item with joined quantities."""
    recipes = [
        _recipe("r-1", [_ingredient("flour", "2 cups")]),
        _recipe("r-2", [_ingredient("Flour", "1 cup")]),
    ]
    items = aggregate_recipe_ingredients(recipes, [])

    assert len(items) == 1
    assert items[0].name == "flour"
    assert items[0].quantity_text == "2 cups + 1 cup"
    assert items[0].source == "recipe"
    assert items[0].source_recipe_id == "r-1"


def test_aggregate_skips_optional_ingredients() -> None:
    """Optional ingredients are excluded from the aggregated list."""
    recipes = [
        _recipe(
            "r-1",
            [
                _ingredient("flour", "2 cups"),
                _ingredient("garnish", "1 sprig", optional=True),
            ],
        )
    ]
    items = aggregate_recipe_ingredients(recipes, [])

    assert {i.name for i in items} == {"flour"}


def test_aggregate_subtracts_pantry() -> None:
    """Aggregated items get pantry flags from the supplied pantry."""
    recipes = [
        _recipe(
            "r-1",
            [_ingredient("flour", "2 cups"), _ingredient("salt", "1 tsp")],
        )
    ]
    pantry = [_pantry("flour", "in_stock"), _pantry("salt", "low")]
    items = aggregate_recipe_ingredients(recipes, pantry)

    by_name = {i.name: i for i in items}
    assert by_name["flour"].pantry_covered is True
    assert by_name["salt"].pantry_low is True


def test_aggregate_dedupes_identical_quantity() -> None:
    """Identical quantity strings are not repeated in quantity_text."""
    recipes = [
        _recipe("r-1", [_ingredient("flour", "1 cup")]),
        _recipe("r-2", [_ingredient("flour", "1 cup")]),
    ]
    items = aggregate_recipe_ingredients(recipes, [])
    assert items[0].quantity_text == "1 cup"


# --- build_shopping_list_response ---


def test_response_keeps_pantry_covered_items_visible() -> None:
    """Pantry-covered items stay on the list so it doubles as a stock check."""
    items = [
        ShoppingListItem(id="s-1", name="milk", aisle="Dairy", pantry_covered=True),
        ShoppingListItem(id="s-2", name="eggs", aisle="Dairy"),
    ]
    response = build_shopping_list_response(items)

    assert response["total_visible"] == 2
    assert len(response["groups"]) == 1
    names = {i.name for i in response["groups"][0]["items"]}
    assert names == {"milk", "eggs"}


def test_response_groups_ordered_by_aisle() -> None:
    """Groups follow AISLE_ORDER (Produce before Dairy before Pantry)."""
    items = [
        ShoppingListItem(id="s-1", name="flour", aisle="Pantry"),
        ShoppingListItem(id="s-2", name="apple", aisle="Produce"),
        ShoppingListItem(id="s-3", name="milk", aisle="Dairy"),
    ]
    response = build_shopping_list_response(items)
    aisles = [g["aisle"] for g in response["groups"]]
    assert aisles == ["Produce", "Dairy", "Pantry"]


def test_response_total_visible_counts_every_item() -> None:
    """total_visible counts all items regardless of pantry state."""
    items = [
        ShoppingListItem(id="s-1", name="milk", aisle="Dairy", pantry_covered=True),
        ShoppingListItem(id="s-2", name="salt", aisle="Pantry", pantry_low=True),
        ShoppingListItem(id="s-3", name="eggs", aisle="Dairy"),
    ]
    response = build_shopping_list_response(items)
    assert response["total_visible"] == 3
    assert "hidden_pantry_covered" not in response
