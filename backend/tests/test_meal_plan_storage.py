"""Tests for MealPlanStore."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from allaroundfood.meal_plan_storage import MealPlanStore
from allaroundfood.models import MealPlan, PlannedMeal


def _plan(week_of: str, meals: list[PlannedMeal] | None = None) -> MealPlan:
    """Build a MealPlan for tests."""
    return MealPlan(week_of=week_of, meals=meals or [])


def test_load_creates_empty_store_when_file_missing(tmp_path: Path) -> None:
    """Load from a non-existent file creates an empty store."""
    store = MealPlanStore.load(tmp_path / "missing.parquet")
    assert store.all() == []


def test_upsert_returns_new_instance(tmp_path: Path) -> None:
    """upsert() returns a new store without mutating the original."""
    store1 = MealPlanStore.load(tmp_path / "m.parquet")
    store2 = store1.upsert(_plan("2026-05-18"))

    assert store2 is not store1
    assert store1.all() == []
    assert len(store2.all()) == 1


def test_round_trip(tmp_path: Path) -> None:
    """Add a plan with meals, save, reload, and verify it matches."""
    db_path = tmp_path / "roundtrip.parquet"
    original = MealPlan(
        week_of="2026-05-18",
        meals=[
            PlannedMeal(day_index=0, slot="dinner", recipe_id="r-1"),
            PlannedMeal(day_index=2, slot="lunch", recipe_id="r-2"),
        ],
        updated_at=datetime(2026, 5, 18, 9, 0, 0, tzinfo=UTC),
    )

    MealPlanStore.load(db_path).upsert(original).save()
    loaded = MealPlanStore.load(db_path).all()

    assert len(loaded) == 1
    assert loaded[0].model_dump() == original.model_dump()


def test_get_by_week(tmp_path: Path) -> None:
    """get() returns the plan for a week, or None for an unknown week."""
    store = MealPlanStore.load(tmp_path / "m.parquet").upsert(
        _plan("2026-05-18", [PlannedMeal(day_index=1, slot="dinner", recipe_id="r-1")])
    )

    found = store.get("2026-05-18")
    assert found is not None
    assert len(found.meals) == 1
    assert found.meals[0].recipe_id == "r-1"
    assert store.get("2026-06-01") is None


def test_upsert_replaces_existing_week(tmp_path: Path) -> None:
    """upsert() replaces the plan for a week instead of duplicating it."""
    store = MealPlanStore.load(tmp_path / "m.parquet").upsert(
        _plan("2026-05-18", [PlannedMeal(day_index=0, slot="dinner", recipe_id="old")])
    )
    store = store.upsert(
        _plan("2026-05-18", [PlannedMeal(day_index=0, slot="dinner", recipe_id="new")])
    )

    assert len(store.all()) == 1
    plan = store.get("2026-05-18")
    assert plan is not None
    assert plan.meals[0].recipe_id == "new"


def test_upsert_keeps_other_weeks(tmp_path: Path) -> None:
    """upsert() of one week leaves other weeks untouched."""
    store = (
        MealPlanStore.load(tmp_path / "m.parquet")
        .upsert(_plan("2026-05-18"))
        .upsert(_plan("2026-05-25"))
    )
    assert {p.week_of for p in store.all()} == {"2026-05-18", "2026-05-25"}


def test_empty_plan_round_trip(tmp_path: Path) -> None:
    """A plan with no meals round-trips correctly."""
    db_path = tmp_path / "empty.parquet"
    MealPlanStore.load(db_path).upsert(_plan("2026-05-18")).save()

    plan = MealPlanStore.load(db_path).get("2026-05-18")
    assert plan is not None
    assert plan.meals == []


def test_backward_compat_missing_column(tmp_path: Path) -> None:
    """Loading a parquet missing newer columns fills them with defaults."""
    db_path = tmp_path / "old.parquet"
    pl.DataFrame(
        {"week_of": ["2026-05-18"], "meals": ["[]"]}
    ).write_parquet(db_path)

    plans = MealPlanStore.load(db_path).all()
    assert len(plans) == 1
    assert plans[0].week_of == "2026-05-18"
