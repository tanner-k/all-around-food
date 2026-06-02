"""Tests for PantryStore."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from allaroundfood.models import PantryItem
from allaroundfood.pantry_storage import PantryStore


def _item(item_id: str, name: str, **kwargs: object) -> PantryItem:
    """Build a PantryItem with sensible test defaults."""
    return PantryItem(id=item_id, name=name, **kwargs)  # type: ignore[arg-type]


def test_load_creates_empty_store_when_file_missing(tmp_path: Path) -> None:
    """Load from a non-existent file creates an empty store."""
    store = PantryStore.load(tmp_path / "missing.parquet")
    assert store.all() == []


def test_add_returns_new_instance(tmp_path: Path) -> None:
    """add() returns a new store without mutating the original."""
    store1 = PantryStore.load(tmp_path / "p.parquet")
    store2 = store1.add(_item("p-1", "flour"))

    assert store2 is not store1
    assert store1.all() == []
    assert len(store2.all()) == 1
    assert store2.all()[0].id == "p-1"


def test_round_trip(tmp_path: Path) -> None:
    """Add, save, reload, and verify the item matches."""
    db_path = tmp_path / "roundtrip.parquet"
    original = PantryItem(
        id="p-1",
        name="olive oil",
        status="low",
        aisle="Pantry",
        aisle_overridden=True,
        notes="almost empty",
        created_at=datetime(2026, 5, 1, 9, 0, 0, tzinfo=UTC),
        updated_at=datetime(2026, 5, 20, 9, 0, 0, tzinfo=UTC),
    )

    PantryStore.load(db_path).add(original).save()
    loaded = PantryStore.load(db_path).all()

    assert len(loaded) == 1
    assert loaded[0].model_dump() == original.model_dump()


def test_get_by_id(tmp_path: Path) -> None:
    """get() returns the matching item, or None for an unknown id."""
    store = PantryStore.load(tmp_path / "p.parquet").add(_item("p-1", "salt"))

    found = store.get("p-1")
    assert found is not None
    assert found.name == "salt"
    assert store.get("nope") is None


def test_get_by_name_case_insensitive(tmp_path: Path) -> None:
    """get_by_name() matches regardless of casing/whitespace."""
    store = PantryStore.load(tmp_path / "p.parquet").add(_item("p-1", "olive oil"))

    found = store.get_by_name("  Olive   Oil ")
    assert found is not None
    assert found.id == "p-1"


def test_get_by_name_not_found(tmp_path: Path) -> None:
    """get_by_name() returns None when there's no match."""
    store = PantryStore.load(tmp_path / "p.parquet").add(_item("p-1", "salt"))
    assert store.get_by_name("pepper") is None


def test_update_replaces_row(tmp_path: Path) -> None:
    """update() replaces the row and keeps the row count stable."""
    db_path = tmp_path / "p.parquet"
    store = PantryStore.load(db_path).add(_item("p-1", "flour", status="in_stock"))

    updated = store.get("p-1")
    assert updated is not None
    store = store.update("p-1", updated.model_copy(update={"status": "out"}))
    store.save()

    reloaded = PantryStore.load(db_path)
    result = reloaded.get("p-1")
    assert result is not None
    assert result.status == "out"
    assert len(reloaded.all()) == 1


def test_update_unknown_id_raises(tmp_path: Path) -> None:
    """update() with an unknown id raises KeyError."""
    store = PantryStore.load(tmp_path / "p.parquet").add(_item("p-1", "flour"))
    with pytest.raises(KeyError):
        store.update("missing", _item("missing", "sugar"))


def test_update_returns_new_instance(tmp_path: Path) -> None:
    """update() returns a new store; the original is unchanged."""
    store1 = PantryStore.load(tmp_path / "p.parquet").add(
        _item("p-1", "flour", status="in_stock")
    )
    original = store1.get("p-1")
    assert original is not None
    store2 = store1.update("p-1", original.model_copy(update={"status": "low"}))

    assert store2 is not store1
    first = store1.get("p-1")
    second = store2.get("p-1")
    assert first is not None and first.status == "in_stock"
    assert second is not None and second.status == "low"


def test_delete_removes_item(tmp_path: Path) -> None:
    """delete() removes the item and returns a new store."""
    store = (
        PantryStore.load(tmp_path / "p.parquet")
        .add(_item("p-1", "flour"))
        .add(_item("p-2", "sugar"))
    )
    after = store.delete("p-1")

    assert after is not store
    assert len(store.all()) == 2
    assert len(after.all()) == 1
    assert after.get("p-1") is None
    assert after.get("p-2") is not None


def test_delete_unknown_id_raises(tmp_path: Path) -> None:
    """delete() with an unknown id raises KeyError."""
    store = PantryStore.load(tmp_path / "p.parquet").add(_item("p-1", "flour"))
    with pytest.raises(KeyError):
        store.delete("missing")


def test_upsert_by_name_inserts_new(tmp_path: Path) -> None:
    """upsert_by_name() appends when no item shares the name."""
    store = PantryStore.load(tmp_path / "p.parquet").upsert_by_name(
        _item("p-1", "flour")
    )
    assert len(store.all()) == 1
    assert store.get("p-1") is not None


def test_upsert_by_name_updates_existing(tmp_path: Path) -> None:
    """upsert_by_name() updates in place and keeps the existing id."""
    store = PantryStore.load(tmp_path / "p.parquet").add(
        _item("p-1", "flour", status="out")
    )
    store = store.upsert_by_name(_item("p-2", "  FLOUR ", status="in_stock"))

    assert len(store.all()) == 1
    kept = store.get("p-1")
    assert kept is not None
    assert kept.status == "in_stock"
    assert store.get("p-2") is None


def test_backward_compat_missing_columns(tmp_path: Path) -> None:
    """Loading a parquet missing newer columns fills them with defaults."""
    db_path = tmp_path / "old.parquet"
    pl.DataFrame(
        {
            "id": ["p-old"],
            "name": ["flour"],
            "status": ["in_stock"],
            "aisle": ["Pantry"],
        }
    ).write_parquet(db_path)

    items = PantryStore.load(db_path).all()
    assert len(items) == 1
    assert items[0].id == "p-old"
    assert items[0].aisle_overridden is False
    assert items[0].notes is None
