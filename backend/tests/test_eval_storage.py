"""Tests for EvalStore."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from allaroundfood.eval_storage import EvalStore
from allaroundfood.models import Evaluation, JudgeFieldCheck


def test_load_creates_empty_store_when_file_missing(tmp_path: Path) -> None:
    """Load from a non-existent file creates an empty store."""
    db_path = tmp_path / "nonexistent.parquet"
    store = EvalStore.load(db_path)
    assert store.all() == []


def test_add_returns_new_instance(tmp_path: Path) -> None:
    """add() returns a new EvalStore without mutating the original."""
    db_path = tmp_path / "test.parquet"
    store1 = EvalStore.load(db_path)

    evaluation = Evaluation(
        id="eval-1",
        source_kind="url",
        source_ref="https://example.com/recipe",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract recipe from the URL",
        worker_output='{"id":"r1","title":"Test","ingredients":[],"steps":[]}',
        worker_parse_confidence=0.85,
        judge_model="gpt-4o",
        judge_prompt="Evaluate the extraction",
        overall_grade=8,
        accuracy_grade=8,
        completeness_grade=7,
        strengths=["Clear structure"],
        weaknesses=["Missing details"],
        field_checks=[],
        reasoning="Good extraction overall",
        raw_judge_output="{}",
    )

    store2 = store1.add(evaluation)

    # Verify store2 is a different instance
    assert store2 is not store1
    # Verify store1 was not mutated
    assert store1.all() == []
    # Verify store2 contains the evaluation
    assert len(store2.all()) == 1
    assert store2.all()[0].id == "eval-1"


def test_round_trip(tmp_path: Path) -> None:
    """Add evaluation, save, load fresh, and verify it matches."""
    db_path = tmp_path / "roundtrip.parquet"

    # Create and save
    original_eval = Evaluation(
        id="eval-123",
        created_at=datetime(2024, 1, 15, 10, 30, 45, tzinfo=UTC),
        source_kind="image",
        source_ref="screenshot:abc123",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract recipe",
        worker_output='{"id":"r1","title":"Pasta","ingredients":[],"steps":[]}',
        worker_parse_confidence=0.9,
        judge_model="gpt-4o",
        judge_prompt="Judge this extraction",
        overall_grade=9,
        accuracy_grade=9,
        completeness_grade=8,
        strengths=["Complete", "Accurate"],
        weaknesses=["Minor typos"],
        field_checks=[
            JudgeFieldCheck(
                field="title", issue="fine", detail="Title is correct"
            ),
        ],
        reasoning="Excellent extraction with minimal issues",
        suggested_prompt_improvements="Ask for more detail on prep time",
        raw_judge_output="{}",
    )

    store1 = EvalStore.load(db_path)
    store2 = store1.add(original_eval)
    store2.save()

    # Load fresh from disk
    store3 = EvalStore.load(db_path)
    loaded_evals = store3.all()

    assert len(loaded_evals) == 1
    loaded = loaded_evals[0]

    # Compare by model_dump()
    assert loaded.model_dump() == original_eval.model_dump()


def test_multiple_evaluations_preserved(tmp_path: Path) -> None:
    """Add two evaluations in sequence, save, reload, and verify both."""
    db_path = tmp_path / "multiple.parquet"

    eval1 = Evaluation(
        id="eval-1",
        source_kind="url",
        source_ref="https://example.com/1",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract",
        worker_output='{"id":"r1","title":"R1","ingredients":[],"steps":[]}',
        judge_model="gpt-4o",
        judge_prompt="Judge",
        overall_grade=8,
        accuracy_grade=8,
        completeness_grade=8,
        strengths=["Good"],
        weaknesses=[],
        field_checks=[],
        reasoning="Good",
        raw_judge_output="{}",
    )

    eval2 = Evaluation(
        id="eval-2",
        source_kind="image",
        source_ref="screenshot:def456",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract",
        worker_output='{"id":"r2","title":"R2","ingredients":[],"steps":[]}',
        judge_model="gpt-4o",
        judge_prompt="Judge",
        overall_grade=7,
        accuracy_grade=7,
        completeness_grade=7,
        strengths=["Okay"],
        weaknesses=["Incomplete"],
        field_checks=[],
        reasoning="Okay",
        raw_judge_output="{}",
    )

    store = EvalStore.load(db_path)
    store = store.add(eval1)
    store = store.add(eval2)
    store.save()

    # Load fresh
    store_loaded = EvalStore.load(db_path)
    evals = store_loaded.all()

    assert len(evals) == 2
    # all() returns evaluations sorted by created_at descending, so eval2 comes first
    assert evals[0].id == "eval-2"
    assert evals[1].id == "eval-1"


def test_stats_empty(tmp_path: Path) -> None:
    """stats() on empty store returns count=0 and means=None."""
    db_path = tmp_path / "empty.parquet"
    store = EvalStore.load(db_path)

    stats = store.stats()

    assert stats["count"] == 0
    assert stats["mean_overall"] is None
    assert stats["mean_accuracy"] is None
    assert stats["mean_completeness"] is None
    assert stats["min_overall"] is None
    assert stats["max_overall"] is None
    assert stats["last_30d_count"] == 0


def test_stats_with_data(tmp_path: Path) -> None:
    """stats() with data returns correct aggregates."""
    db_path = tmp_path / "stats.parquet"

    now = datetime.now(UTC)
    thirty_days_ago = now - timedelta(days=30)

    eval1 = Evaluation(
        id="eval-1",
        created_at=now,
        source_kind="url",
        source_ref="https://example.com/1",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract",
        worker_output='{"id":"r1","title":"R1","ingredients":[],"steps":[]}',
        judge_model="gpt-4o",
        judge_prompt="Judge",
        overall_grade=10,
        accuracy_grade=10,
        completeness_grade=10,
        strengths=["Perfect"],
        weaknesses=[],
        field_checks=[],
        reasoning="Perfect",
        raw_judge_output="{}",
    )

    eval2 = Evaluation(
        id="eval-2",
        created_at=now,
        source_kind="image",
        source_ref="screenshot:abc",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract",
        worker_output='{"id":"r2","title":"R2","ingredients":[],"steps":[]}',
        judge_model="gpt-4o",
        judge_prompt="Judge",
        overall_grade=8,
        accuracy_grade=8,
        completeness_grade=8,
        strengths=["Good"],
        weaknesses=["Minor"],
        field_checks=[],
        reasoning="Good",
        raw_judge_output="{}",
    )

    eval3 = Evaluation(
        id="eval-3",
        created_at=thirty_days_ago,  # Old evaluation outside 30d window
        source_kind="url",
        source_ref="https://example.com/3",
        worker_model="gpt-4o-mini",
        worker_prompt="Extract",
        worker_output='{"id":"r3","title":"R3","ingredients":[],"steps":[]}',
        judge_model="gpt-4o",
        judge_prompt="Judge",
        overall_grade=6,
        accuracy_grade=6,
        completeness_grade=6,
        strengths=["Okay"],
        weaknesses=["Incomplete"],
        field_checks=[],
        reasoning="Okay",
        raw_judge_output="{}",
    )

    store = EvalStore.load(db_path)
    store = store.add(eval1).add(eval2).add(eval3)
    store.save()

    store_loaded = EvalStore.load(db_path)
    stats = store_loaded.stats()

    assert stats["count"] == 3
    assert stats["mean_overall"] == 8.0  # (10 + 8 + 6) / 3
    assert stats["mean_accuracy"] == 8.0
    assert stats["mean_completeness"] == 8.0
    assert stats["min_overall"] == 6
    assert stats["max_overall"] == 10
    assert stats["last_30d_count"] == 2  # Only eval1 and eval2 are within 30 days
