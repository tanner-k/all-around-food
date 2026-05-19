"""Tests for FastAPI endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Fixture that provides a TestClient with temporary storage paths."""
    monkeypatch.setattr("allaroundfood.api.RECIPE_STORE_PATH", tmp_path / "r.parquet")
    monkeypatch.setattr("allaroundfood.api.EVAL_STORE_PATH", tmp_path / "e.parquet")
    from allaroundfood.api import app
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    """GET /healthz returns 200 with status ok."""
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_post_recipe_then_get(client: TestClient) -> None:
    """POST a recipe and GET /recipes returns it."""
    recipe_data = {
        "id": "recipe-1",
        "title": "Pasta",
        "description": "Simple pasta",
        "source_url": "https://example.com/pasta",
        "source_attribution": "Example.com",
        "prep_time_min": 10,
        "cook_time_min": 20,
        "total_time_min": 30,
        "servings": 4,
        "yield_text": "4 servings",
        "ingredients": [
            {
                "name": "pasta",
                "quantity": {"value": 1.0, "unit": "lb", "as_written": "1 lb"},
                "preparation": None,
                "optional": False,
                "group": None,
                "notes": None,
            }
        ],
        "steps": [
            {
                "order": 1,
                "instruction": "Boil water",
                "duration_min": 10.0,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": [],
            }
        ],
        "equipment": [],
        "cuisine": "Italian",
        "course": "Main",
        "dietary_tags": [],
        "difficulty": "easy",
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "times_made": 0,
        "parse_confidence": 0.9,
    }

    response = client.post("/recipes", json=recipe_data)
    assert response.status_code == 200
    saved_recipe = response.json()
    assert saved_recipe["id"] == "recipe-1"
    assert saved_recipe["title"] == "Pasta"

    # GET /recipes
    response = client.get("/recipes")
    assert response.status_code == 200
    recipes = response.json()
    assert len(recipes) == 1
    assert recipes[0]["id"] == "recipe-1"


def test_get_recipe_by_id(client: TestClient) -> None:
    """POST a recipe and GET /recipes/{recipe_id} returns it."""
    recipe_data = {
        "id": "recipe-2",
        "title": "Salad",
        "description": None,
        "source_url": None,
        "source_attribution": None,
        "prep_time_min": 5,
        "cook_time_min": None,
        "total_time_min": 5,
        "servings": 2,
        "yield_text": None,
        "ingredients": [
            {
                "name": "lettuce",
                "quantity": {"value": 2.0, "unit": "cups", "as_written": "2 cups"},
                "preparation": "chopped",
                "optional": False,
                "group": None,
                "notes": None,
            }
        ],
        "steps": [
            {
                "order": 1,
                "instruction": "Chop and mix",
                "duration_min": None,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": [],
            }
        ],
        "equipment": [],
        "cuisine": None,
        "course": None,
        "dietary_tags": ["vegetarian"],
        "difficulty": None,
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "times_made": 0,
        "parse_confidence": None,
    }

    client.post("/recipes", json=recipe_data)

    response = client.get("/recipes/recipe-2")
    assert response.status_code == 200
    recipe = response.json()
    assert recipe["id"] == "recipe-2"
    assert recipe["title"] == "Salad"


def test_get_recipe_404(client: TestClient) -> None:
    """GET /recipes/{recipe_id} with unknown id returns 404."""
    response = client.get("/recipes/nonexistent")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_post_evaluation_then_get(client: TestClient) -> None:
    """POST an evaluation and GET /evaluations returns it."""
    eval_data = {
        "id": "eval-1",
        "source_kind": "url",
        "source_ref": "https://example.com/recipe",
        "worker_model": "gpt-4o-mini",
        "worker_prompt": "Extract recipe",
        "worker_output": '{"id":"r1","title":"Test","ingredients":[],"steps":[]}',
        "worker_parse_confidence": 0.85,
        "judge_model": "gpt-4o",
        "judge_prompt": "Evaluate",
        "overall_grade": 8,
        "accuracy_grade": 8,
        "completeness_grade": 7,
        "strengths": ["Good structure"],
        "weaknesses": ["Missing details"],
        "field_checks": [],
        "reasoning": "Overall good",
        "suggested_prompt_improvements": None,
        "raw_judge_output": "{}",
    }

    response = client.post("/evaluations", json=eval_data)
    assert response.status_code == 200
    saved_eval = response.json()
    assert saved_eval["id"] == "eval-1"

    # GET /evaluations
    response = client.get("/evaluations")
    assert response.status_code == 200
    evals = response.json()
    assert len(evals) == 1
    assert evals[0]["id"] == "eval-1"


def test_evaluations_stats_empty(client: TestClient) -> None:
    """GET /evaluations/stats on empty store returns zeros and nulls."""
    response = client.get("/evaluations/stats")
    assert response.status_code == 200
    stats = response.json()
    assert stats["count"] == 0
    assert stats["mean_overall"] is None
    assert stats["mean_accuracy"] is None
    assert stats["mean_completeness"] is None
    assert stats["min_overall"] is None
    assert stats["max_overall"] is None
    assert stats["last_30d_count"] == 0


def test_evaluations_stats_with_data(client: TestClient) -> None:
    """GET /evaluations/stats with data returns correct aggregates."""
    eval1_data = {
        "id": "eval-1",
        "source_kind": "url",
        "source_ref": "https://example.com/1",
        "worker_model": "gpt-4o-mini",
        "worker_prompt": "Extract",
        "worker_output": '{"id":"r1","title":"R1","ingredients":[],"steps":[]}',
        "worker_parse_confidence": None,
        "judge_model": "gpt-4o",
        "judge_prompt": "Judge",
        "overall_grade": 10,
        "accuracy_grade": 10,
        "completeness_grade": 10,
        "strengths": ["Perfect"],
        "weaknesses": [],
        "field_checks": [],
        "reasoning": "Perfect",
        "suggested_prompt_improvements": None,
        "raw_judge_output": "{}",
    }

    eval2_data = {
        "id": "eval-2",
        "source_kind": "image",
        "source_ref": "screenshot:abc",
        "worker_model": "gpt-4o-mini",
        "worker_prompt": "Extract",
        "worker_output": '{"id":"r2","title":"R2","ingredients":[],"steps":[]}',
        "worker_parse_confidence": None,
        "judge_model": "gpt-4o",
        "judge_prompt": "Judge",
        "overall_grade": 8,
        "accuracy_grade": 8,
        "completeness_grade": 8,
        "strengths": ["Good"],
        "weaknesses": ["Minor"],
        "field_checks": [],
        "reasoning": "Good",
        "suggested_prompt_improvements": None,
        "raw_judge_output": "{}",
    }

    eval3_data = {
        "id": "eval-3",
        "source_kind": "url",
        "source_ref": "https://example.com/3",
        "worker_model": "gpt-4o-mini",
        "worker_prompt": "Extract",
        "worker_output": '{"id":"r3","title":"R3","ingredients":[],"steps":[]}',
        "worker_parse_confidence": None,
        "judge_model": "gpt-4o",
        "judge_prompt": "Judge",
        "overall_grade": 6,
        "accuracy_grade": 6,
        "completeness_grade": 6,
        "strengths": ["Okay"],
        "weaknesses": ["Incomplete"],
        "field_checks": [],
        "reasoning": "Okay",
        "suggested_prompt_improvements": None,
        "raw_judge_output": "{}",
    }

    client.post("/evaluations", json=eval1_data)
    client.post("/evaluations", json=eval2_data)
    client.post("/evaluations", json=eval3_data)

    response = client.get("/evaluations/stats")
    assert response.status_code == 200
    stats = response.json()

    assert stats["count"] == 3
    assert stats["mean_overall"] == 8.0  # (10 + 8 + 6) / 3
    assert stats["mean_accuracy"] == 8.0
    assert stats["mean_completeness"] == 8.0
    assert stats["min_overall"] == 6
    assert stats["max_overall"] == 10
    assert stats["last_30d_count"] == 3  # All are recent
