"""Smart shopping-list logic: pantry subtraction, recipe aggregation, grouping."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from allaroundfood.aisles import AISLE_ORDER, categorize
from allaroundfood.models import PantryItem, Recipe, ShoppingListItem
from allaroundfood.naming import normalize_name


def _pantry_index(pantry_items: list[PantryItem]) -> dict[str, PantryItem]:
    """Build a normalized-name -> PantryItem lookup."""
    return {normalize_name(item.name): item for item in pantry_items}


def compute_pantry_flags(
    item: ShoppingListItem, pantry_by_name: dict[str, PantryItem]
) -> ShoppingListItem:
    """Return a copy of ``item`` with pantry flags recomputed.

    An ``in_stock`` pantry match marks the item as covered; a ``low`` match
    flags it as low; ``out`` or no match leaves it as a plain to-buy item.

    Args:
        item: The shopping-list item.
        pantry_by_name: Normalized-name -> PantryItem lookup.

    Returns:
        A new ShoppingListItem with ``pantry_covered``/``pantry_low`` set.
    """
    match = pantry_by_name.get(normalize_name(item.name))
    if match is None or match.status == "out":
        covered, low = False, False
    elif match.status == "in_stock":
        covered, low = True, False
    else:  # low
        covered, low = False, True
    return item.model_copy(
        update={"pantry_covered": covered, "pantry_low": low}
    )


def recompute_all_flags(
    shopping_items: list[ShoppingListItem], pantry_items: list[PantryItem]
) -> list[ShoppingListItem]:
    """Recompute pantry flags for every shopping-list item.

    Args:
        shopping_items: The current shopping-list items.
        pantry_items: The current pantry items.

    Returns:
        A new list of ShoppingListItems with refreshed pantry flags.
    """
    pantry_by_name = _pantry_index(pantry_items)
    return [compute_pantry_flags(item, pantry_by_name) for item in shopping_items]


@dataclass
class _Aggregated:
    """Local accumulator for one deduped ingredient across recipes."""

    quantities: list[str] = field(default_factory=list)
    source_recipe_id: str | None = None


def aggregate_recipe_ingredients(
    recipes: list[Recipe], pantry_items: list[PantryItem]
) -> list[ShoppingListItem]:
    """Aggregate recipe ingredients into deduped shopping-list items.

    Optional ingredients are skipped. Ingredients are deduped by normalized
    name; distinct ``as_written`` quantity strings are joined with ``" + "``
    (no numeric summation — units are not normalized). Pantry flags are
    computed against the supplied pantry.

    Args:
        recipes: Recipes to draw ingredients from.
        pantry_items: The current pantry items, for subtraction.

    Returns:
        A list of recipe-sourced ShoppingListItems.
    """
    pantry_by_name = _pantry_index(pantry_items)
    accumulated: dict[str, _Aggregated] = {}

    for recipe in recipes:
        for ingredient in recipe.ingredients:
            if ingredient.optional:
                continue
            key = normalize_name(ingredient.name)
            if not key:
                continue
            entry = accumulated.setdefault(key, _Aggregated())
            if entry.source_recipe_id is None:
                entry.source_recipe_id = recipe.id
            qty = ingredient.quantity.as_written.strip()
            if qty and qty not in entry.quantities:
                entry.quantities.append(qty)

    items: list[ShoppingListItem] = []
    for name, entry in accumulated.items():
        item = ShoppingListItem(
            id=str(uuid.uuid4()),
            name=name,
            quantity_text=" + ".join(entry.quantities) or None,
            aisle=categorize(name),
            source="recipe",
            source_recipe_id=entry.source_recipe_id,
        )
        items.append(compute_pantry_flags(item, pantry_by_name))
    return items


def build_shopping_list_response(
    items: list[ShoppingListItem],
) -> dict[str, Any]:
    """Build the grouped-by-aisle shopping-list response.

    Every item is included, regardless of pantry state — pantry-covered and
    low items stay on the list so it doubles as a pantry check (their stock
    status is surfaced via the ``pantry_covered``/``pantry_low`` flags).

    Args:
        items: All shopping-list items.

    Returns:
        Dict with ``groups`` and ``total_visible``.
    """
    groups: list[dict[str, Any]] = []
    for aisle in AISLE_ORDER:
        aisle_items = sorted(
            (i for i in items if i.aisle == aisle), key=lambda i: i.name
        )
        if aisle_items:
            groups.append({"aisle": aisle, "items": aisle_items})

    return {"groups": groups, "total_visible": len(items)}
