"""Tests for name normalization."""

from __future__ import annotations

from allaroundfood.naming import normalize_name


def test_lowercases() -> None:
    """normalize_name lowercases the input."""
    assert normalize_name("Olive Oil") == "olive oil"


def test_strips_surrounding_whitespace() -> None:
    """normalize_name strips leading/trailing whitespace."""
    assert normalize_name("  flour  ") == "flour"


def test_collapses_internal_whitespace() -> None:
    """normalize_name collapses internal whitespace runs to one space."""
    assert normalize_name("kosher   salt") == "kosher salt"


def test_handles_tabs_and_newlines() -> None:
    """normalize_name treats tabs/newlines as whitespace."""
    assert normalize_name("brown\tsugar\n") == "brown sugar"


def test_already_normalized_is_unchanged() -> None:
    """A normalized name passes through unchanged."""
    assert normalize_name("whole milk") == "whole milk"


def test_empty_string() -> None:
    """An empty string normalizes to an empty string."""
    assert normalize_name("") == ""
