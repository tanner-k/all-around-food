"""Tests for keyword-based aisle categorization."""

from __future__ import annotations

import pytest

from allaroundfood.aisles import AISLE_KEYWORDS, AISLE_ORDER, categorize


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Roma tomatoes", "Produce"),
        ("baby spinach", "Produce"),
        ("whole milk", "Dairy"),
        ("large eggs", "Dairy"),
        ("boneless chicken thighs", "Meat"),
        ("ground beef", "Meat"),
        ("sourdough bread", "Bakery"),
        ("flour tortillas", "Bakery"),
        ("all-purpose flour", "Pantry"),
        ("olive oil", "Pantry"),
        ("frozen peas", "Frozen"),
        ("vanilla ice cream", "Frozen"),
        ("orange juice", "Beverages"),
        ("ground coffee", "Beverages"),
        ("paper towels", "Household"),
        ("dish soap", "Household"),
    ],
)
def test_categorize_known_items(name: str, expected: str) -> None:
    """categorize routes known items to the expected aisle."""
    assert categorize(name) == expected


def test_unknown_item_falls_back_to_other() -> None:
    """An item with no keyword match falls back to 'Other'."""
    assert categorize("mystery widget") == "Other"


def test_categorize_is_case_insensitive() -> None:
    """categorize matches regardless of input casing."""
    assert categorize("CHICKEN BREAST") == "Meat"
    assert categorize("Chicken Breast") == "Meat"


def test_substring_match() -> None:
    """categorize matches keywords as substrings, not whole words."""
    assert categorize("organic baby carrots") == "Produce"


def test_bell_pepper_is_produce_not_pantry() -> None:
    """'bell pepper' resolves to Produce even though 'pepper' is a Pantry keyword."""
    assert categorize("red bell pepper") == "Produce"


def test_black_pepper_is_pantry() -> None:
    """Plain 'pepper' (no produce keyword) resolves to Pantry."""
    assert categorize("ground black pepper") == "Pantry"


def test_aisle_order_contains_all_keyword_aisles_plus_other() -> None:
    """AISLE_ORDER lists every keyword aisle and ends with 'Other'."""
    assert set(AISLE_ORDER) == set(AISLE_KEYWORDS) | {"Other"}
    assert AISLE_ORDER[-1] == "Other"


def test_every_categorized_aisle_is_in_order() -> None:
    """Every aisle categorize can return is present in AISLE_ORDER."""
    for keywords in AISLE_KEYWORDS.values():
        for keyword in keywords:
            assert categorize(keyword) in AISLE_ORDER
