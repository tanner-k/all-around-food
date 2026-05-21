"""Tests for ShoppingListStore."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from allaroundfood.models import ShoppingListItem
from allaroundfood.shopping_storage import ShoppingListStore


def _item(item_id: str, name: str, **kwargs: object) -> ShoppingListItem:
    """Build a ShoppingListItem with sensible test defaults."""
    return ShoppingListItem(id=item_id, name=name, **kwargs)  # type: ignore[arg-type]


def test_load_creates_empty_store_when_file_missing(tmp_path: Path) -> None:
    """Load from a non-existent file creates an empty store."""
    store = ShoppingListStore.load(tmp_path / "missing.parquet")
    assert store.all() == []


def test_add_returns_new_instance(tmp_path: Path) -> None:
    """add() returns a new store without mutating the original."""
    store1 = ShoppingListStore.load(tmp_path / "s.parquet")
    store2 = store1.add(_item("s-1", "milk"))

    assert store2 is not store1
    assert store1.all() == []
    assert len(store2.all()) == 1


def test_round_trip(tmp_path: Path) -> None:
    """Add, save, reload, and verify the item matches."""
    db_path = tmp_path / "roundtrip.parquet"
    original = ShoppingListItem(
        id="s-1",
        name="olive oil",
        quantity_text="1 cup + 2 tbsp",
        aisle="Pantry",
        checked=True,
        source="recipe",
        source_recipe_id="r-1",
        pantry_covered=False,
        pantry_low=True,
        created_at=datetime(2026, 5, 1, 9, 0, 0, tzinfo=UTC),
    )

    ShoppingListStore.load(db_path).add(original).save()
    loaded = ShoppingListStore.load(db_path).all()

    assert len(loaded) == 1
    assert loaded[0].model_dump() == original.model_dump()


def test_get_by_id(tmp_path: Path) -> None:
    """get() returns the matching item, or None for an unknown id."""
    store = ShoppingListStore.load(tmp_path / "s.parquet").add(_item("s-1", "milk"))
    found = store.get("s-1")
    assert found is not None
    assert found.name == "milk"
    assert store.get("nope") is None


def test_update_replaces_row(tmp_path: Path) -> None:
    """update() replaces the row and keeps the row count stable."""
    store = ShoppingListStore.load(tmp_path / "s.parquet").add(
        _item("s-1", "milk", checked=False)
    )
    current = store.get("s-1")
    assert current is not None
    store = store.update("s-1", current.model_copy(update={"checked": True}))

    result = store.get("s-1")
    assert result is not None
    assert result.checked is True
    assert len(store.all()) == 1


def test_update_unknown_id_raises(tmp_path: Path) -> None:
    """update() with an unknown id raises KeyError."""
    store = ShoppingListStore.load(tmp_path / "s.parquet").add(_item("s-1", "milk"))
    with pytest.raises(KeyError):
        store.update("missing", _item("missing", "eggs"))


def test_delete_removes_item(tmp_path: Path) -> None:
    """delete() removes the item and returns a new store."""
    store = (
        ShoppingListStore.load(tmp_path / "s.parquet")
        .add(_item("s-1", "milk"))
        .add(_item("s-2", "eggs"))
    )
    after = store.delete("s-1")

    assert len(store.all()) == 2
    assert len(after.all()) == 1
    assert after.get("s-1") is None


def test_delete_unknown_id_raises(tmp_path: Path) -> None:
    """delete() with an unknown id raises KeyError."""
    store = ShoppingListStore.load(tmp_path / "s.parquet").add(_item("s-1", "milk"))
    with pytest.raises(KeyError):
        store.delete("missing")


def test_replace_recipe_items_keeps_manual_rows(tmp_path: Path) -> None:
    """replace_recipe_items() swaps recipe rows but leaves manual rows."""
    store = (
        ShoppingListStore.load(tmp_path / "s.parquet")
        .add(_item("m-1", "paper towels", source="manual"))
        .add(_item("r-old", "old flour", source="recipe"))
    )

    store = store.replace_recipe_items(
        [_item("r-new", "new sugar", source="recipe")]
    )

    names = {i.name for i in store.all()}
    assert names == {"paper towels", "new sugar"}
    assert store.get("r-old") is None


def test_clear_checked_removes_checked_rows(tmp_path: Path) -> None:
    """clear_checked() removes only checked rows."""
    store = (
        ShoppingListStore.load(tmp_path / "s.parquet")
        .add(_item("s-1", "milk", checked=True))
        .add(_item("s-2", "eggs", checked=False))
    )
    after = store.clear_checked()

    remaining = [i.name for i in after.all()]
    assert remaining == ["eggs"]


def test_backward_compat_missing_columns(tmp_path: Path) -> None:
    """Loading a parquet missing newer columns fills them with defaults."""
    db_path = tmp_path / "old.parquet"
    pl.DataFrame(
        {"id": ["s-old"], "name": ["milk"], "source": ["manual"]}
    ).write_parquet(db_path)

    items = ShoppingListStore.load(db_path).all()
    assert len(items) == 1
    assert items[0].id == "s-old"
    assert items[0].checked is False
    assert items[0].pantry_covered is False
