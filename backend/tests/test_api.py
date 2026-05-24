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
    monkeypatch.setattr("allaroundfood.api.PANTRY_STORE_PATH", tmp_path / "p.parquet")
    monkeypatch.setattr(
        "allaroundfood.api.SHOPPING_STORE_PATH", tmp_path / "s.parquet"
    )
    monkeypatch.setattr(
        "allaroundfood.api.MEAL_PLAN_STORE_PATH", tmp_path / "m.parquet"
    )
    from allaroundfood.api import app
    return TestClient(app)


def _recipe_payload(
    recipe_id: str, ingredient_names: list[str]
) -> dict[str, object]:
    """Build a minimal recipe POST payload with the given ingredients."""
    return {
        "id": recipe_id,
        "title": f"Recipe {recipe_id}",
        "ingredients": [
            {
                "name": name,
                "quantity": {"value": 1.0, "unit": "cup", "as_written": "1 cup"},
            }
            for name in ingredient_names
        ],
        "steps": [{"order": 1, "instruction": "Cook"}],
    }


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


def test_parse_video_maps_pipeline_errors(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """POST /recipes/parse-video returns friendly pipeline errors."""
    from allaroundfood.video_import import VideoImportError

    async def fake_fetch(url: str) -> None:
        assert url == "https://example.com/video"
        raise VideoImportError(
            "Video import currently supports Instagram and TikTok links only.",
            status_code=422,
        )

    monkeypatch.setattr("allaroundfood.api.fetch_video_text", fake_fetch)

    response = client.post(
        "/recipes/parse-video", json={"url": "https://example.com/video"}
    )

    assert response.status_code == 422
    assert "Instagram and TikTok" in response.json()["detail"]


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


def test_put_recipe(client: TestClient) -> None:
    """PUT /recipes/{recipe_id} updates an existing recipe."""
    # First, POST a recipe
    recipe_data = {
        "id": "recipe-1",
        "title": "Original Title",
        "description": None,
        "source_url": None,
        "source_attribution": None,
        "prep_time_min": 10,
        "cook_time_min": 20,
        "total_time_min": 30,
        "servings": 4,
        "yield_text": None,
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
                "duration_min": None,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": [],
            }
        ],
        "equipment": [],
        "cuisine": None,
        "course": None,
        "dietary_tags": [],
        "difficulty": None,
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "times_made": 0,
        "parse_confidence": None,
    }

    client.post("/recipes", json=recipe_data)

    # Now PUT with updated title
    updated_recipe_data = recipe_data.copy()
    updated_recipe_data["title"] = "Updated Title"
    updated_recipe_data["description"] = "A new description"

    response = client.put("/recipes/recipe-1", json=updated_recipe_data)
    assert response.status_code == 200
    result = response.json()
    assert result["id"] == "recipe-1"
    assert result["title"] == "Updated Title"
    assert result["description"] == "A new description"

    # Verify by GET
    response = client.get("/recipes/recipe-1")
    assert response.status_code == 200
    recipe = response.json()
    assert recipe["title"] == "Updated Title"
    assert recipe["description"] == "A new description"


def test_put_recipe_404(client: TestClient) -> None:
    """PUT /recipes/{recipe_id} with unknown ID returns 404."""
    recipe_data = {
        "id": "recipe-1",
        "title": "Some Title",
        "description": None,
        "source_url": None,
        "source_attribution": None,
        "prep_time_min": None,
        "cook_time_min": None,
        "total_time_min": None,
        "servings": None,
        "yield_text": None,
        "ingredients": [
            {
                "name": "flour",
                "quantity": {"value": 1.0, "unit": "cup", "as_written": "1 cup"},
                "preparation": None,
                "optional": False,
                "group": None,
                "notes": None,
            }
        ],
        "steps": [
            {
                "order": 1,
                "instruction": "Mix",
                "duration_min": None,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": [],
            }
        ],
        "equipment": [],
        "cuisine": None,
        "course": None,
        "dietary_tags": [],
        "difficulty": None,
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "times_made": 0,
        "parse_confidence": None,
    }

    response = client.put("/recipes/nonexistent", json=recipe_data)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_post_cooked_increments(client: TestClient) -> None:
    """POST /recipes/{recipe_id}/cooked increments times_made."""
    # First, POST a recipe
    recipe_data = {
        "id": "recipe-1",
        "title": "Test Recipe",
        "description": None,
        "source_url": None,
        "source_attribution": None,
        "prep_time_min": None,
        "cook_time_min": None,
        "total_time_min": None,
        "servings": None,
        "yield_text": None,
        "ingredients": [
            {
                "name": "flour",
                "quantity": {"value": 1.0, "unit": "cup", "as_written": "1 cup"},
                "preparation": None,
                "optional": False,
                "group": None,
                "notes": None,
            }
        ],
        "steps": [
            {
                "order": 1,
                "instruction": "Mix",
                "duration_min": None,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": [],
            }
        ],
        "equipment": [],
        "cuisine": None,
        "course": None,
        "dietary_tags": [],
        "difficulty": None,
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "times_made": 0,
        "parse_confidence": None,
    }

    client.post("/recipes", json=recipe_data)

    # Verify initial times_made is 0
    response = client.get("/recipes/recipe-1")
    assert response.json()["times_made"] == 0

    # Mark as cooked
    response = client.post("/recipes/recipe-1/cooked")
    assert response.status_code == 200
    result = response.json()
    assert result["times_made"] == 1

    # Verify by GET
    response = client.get("/recipes/recipe-1")
    assert response.json()["times_made"] == 1

    # Mark as cooked again
    response = client.post("/recipes/recipe-1/cooked")
    assert response.status_code == 200
    result = response.json()
    assert result["times_made"] == 2

    # Verify by GET
    response = client.get("/recipes/recipe-1")
    assert response.json()["times_made"] == 2


def test_post_cooked_404(client: TestClient) -> None:
    """POST /recipes/{recipe_id}/cooked with unknown ID returns 404."""
    response = client.post("/recipes/nonexistent/cooked")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# --- Pantry endpoints ---


def test_post_pantry_item_then_get(client: TestClient) -> None:
    """POST a pantry item and GET /pantry returns it."""
    response = client.post("/pantry", json={"id": "", "name": "Olive Oil"})
    assert response.status_code == 200
    item = response.json()
    assert item["name"] == "olive oil"  # normalized
    assert item["id"]  # id assigned

    response = client.get("/pantry")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["name"] == "olive oil"


def test_post_pantry_auto_categorizes(client: TestClient) -> None:
    """POST /pantry auto-assigns the aisle from the item name."""
    response = client.post("/pantry", json={"id": "", "name": "chicken breast"})
    assert response.status_code == 200
    assert response.json()["aisle"] == "Meat"


def test_post_pantry_empty_name_returns_400(client: TestClient) -> None:
    """POST /pantry with a blank name returns 400."""
    response = client.post("/pantry", json={"id": "", "name": "   "})
    assert response.status_code == 400


def test_put_pantry_item(client: TestClient) -> None:
    """PUT /pantry/{id} updates an existing item."""
    created = client.post("/pantry", json={"id": "", "name": "salt"}).json()
    item_id = created["id"]

    created["status"] = "low"
    response = client.put(f"/pantry/{item_id}", json=created)
    assert response.status_code == 200
    assert response.json()["status"] == "low"


def test_put_pantry_sets_aisle_overridden(client: TestClient) -> None:
    """PUT /pantry/{id} with a changed aisle marks it as overridden."""
    created = client.post("/pantry", json={"id": "", "name": "salt"}).json()
    assert created["aisle"] == "Pantry"

    created["aisle"] = "Household"
    response = client.put(f"/pantry/{created['id']}", json=created)
    assert response.status_code == 200
    body = response.json()
    assert body["aisle"] == "Household"
    assert body["aisle_overridden"] is True


def test_put_pantry_404(client: TestClient) -> None:
    """PUT /pantry/{id} with an unknown id returns 404."""
    response = client.put(
        "/pantry/nonexistent", json={"id": "nonexistent", "name": "salt"}
    )
    assert response.status_code == 404


def test_patch_pantry_status(client: TestClient) -> None:
    """PATCH /pantry/{id}/status updates the stock status."""
    created = client.post("/pantry", json={"id": "", "name": "flour"}).json()
    response = client.patch(
        f"/pantry/{created['id']}/status", json={"status": "out"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "out"


def test_patch_pantry_status_404(client: TestClient) -> None:
    """PATCH /pantry/{id}/status with an unknown id returns 404."""
    response = client.patch("/pantry/nonexistent/status", json={"status": "out"})
    assert response.status_code == 404


def test_delete_pantry_item(client: TestClient) -> None:
    """DELETE /pantry/{id} removes the item."""
    created = client.post("/pantry", json={"id": "", "name": "flour"}).json()
    response = client.delete(f"/pantry/{created['id']}")
    assert response.status_code == 200

    assert client.get("/pantry").json() == []


def test_delete_pantry_404(client: TestClient) -> None:
    """DELETE /pantry/{id} with an unknown id returns 404."""
    response = client.delete("/pantry/nonexistent")
    assert response.status_code == 404


def test_receipt_import_adds_and_updates(client: TestClient) -> None:
    """POST /pantry/receipt-import adds new items and refreshes existing ones."""
    # Pre-existing item, marked out
    created = client.post("/pantry", json={"id": "", "name": "milk"}).json()
    client.patch(f"/pantry/{created['id']}/status", json={"status": "out"})

    response = client.post(
        "/pantry/receipt-import", json={"names": ["Milk", "Eggs", "Bread"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["added"] == 2  # eggs, bread
    assert body["updated"] == 1  # milk

    items = {i["name"]: i for i in client.get("/pantry").json()}
    assert len(items) == 3
    assert items["milk"]["status"] == "in_stock"  # refreshed
    assert items["eggs"]["aisle"] == "Dairy"


def test_get_pantry_sorted_by_aisle(client: TestClient) -> None:
    """GET /pantry returns items ordered by aisle then name."""
    client.post("/pantry", json={"id": "", "name": "milk"})  # Dairy
    client.post("/pantry", json={"id": "", "name": "apple"})  # Produce
    client.post("/pantry", json={"id": "", "name": "flour"})  # Pantry

    names = [i["name"] for i in client.get("/pantry").json()]
    assert names == ["apple", "milk", "flour"]  # Produce, Dairy, Pantry


# --- Shopping-list endpoints ---


def test_post_shopping_item_then_get(client: TestClient) -> None:
    """POST a manual item and GET /shopping-list returns it grouped."""
    response = client.post(
        "/shopping-list/items", json={"id": "", "name": "Paper Towels"}
    )
    assert response.status_code == 200
    item = response.json()
    assert item["name"] == "paper towels"
    assert item["aisle"] == "Household"
    assert item["source"] == "manual"

    body = client.get("/shopping-list").json()
    assert body["total_visible"] == 1
    assert body["groups"][0]["aisle"] == "Household"


def test_post_shopping_item_empty_name_400(client: TestClient) -> None:
    """POST /shopping-list/items with a blank name returns 400."""
    response = client.post("/shopping-list/items", json={"id": "", "name": " "})
    assert response.status_code == 400


def test_patch_shopping_check(client: TestClient) -> None:
    """PATCH /shopping-list/items/{id}/check toggles checked state."""
    created = client.post(
        "/shopping-list/items", json={"id": "", "name": "milk"}
    ).json()
    response = client.patch(
        f"/shopping-list/items/{created['id']}/check", json={"checked": True}
    )
    assert response.status_code == 200
    assert response.json()["checked"] is True


def test_patch_shopping_check_404(client: TestClient) -> None:
    """PATCH check on an unknown id returns 404."""
    response = client.patch(
        "/shopping-list/items/nonexistent/check", json={"checked": True}
    )
    assert response.status_code == 404


def test_delete_shopping_item(client: TestClient) -> None:
    """DELETE /shopping-list/items/{id} removes the item."""
    created = client.post(
        "/shopping-list/items", json={"id": "", "name": "milk"}
    ).json()
    response = client.delete(f"/shopping-list/items/{created['id']}")
    assert response.status_code == 200
    assert client.get("/shopping-list").json()["total_visible"] == 0


def test_delete_shopping_item_404(client: TestClient) -> None:
    """DELETE on an unknown shopping item id returns 404."""
    response = client.delete("/shopping-list/items/nonexistent")
    assert response.status_code == 404


def test_generate_dedupes_shared_ingredient(client: TestClient) -> None:
    """POST /shopping-list/generate aggregates and dedupes recipe ingredients."""
    client.post("/recipes", json=_recipe_payload("r-1", ["flour", "sugar"]))
    client.post("/recipes", json=_recipe_payload("r-2", ["flour", "eggs"]))

    response = client.post(
        "/shopping-list/generate", json={"recipe_ids": ["r-1", "r-2"]}
    )
    assert response.status_code == 200
    names = [
        item["name"]
        for group in response.json()["groups"]
        for item in group["items"]
    ]
    assert sorted(names) == ["eggs", "flour", "sugar"]  # flour deduped


def test_generate_preserves_manual_items(client: TestClient) -> None:
    """Regenerating recipe items keeps existing manual items."""
    client.post("/shopping-list/items", json={"id": "", "name": "paper towels"})
    client.post("/recipes", json=_recipe_payload("r-1", ["flour"]))

    client.post("/shopping-list/generate", json={"recipe_ids": ["r-1"]})
    client.post("/shopping-list/generate", json={"recipe_ids": ["r-1"]})

    names = sorted(
        item["name"]
        for group in client.get("/shopping-list").json()["groups"]
        for item in group["items"]
    )
    assert names == ["flour", "paper towels"]  # manual kept, flour not doubled


def test_pantry_in_stock_item_stays_visible_flagged(client: TestClient) -> None:
    """An in_stock pantry item stays on the list, flagged pantry_covered."""
    client.post("/recipes", json=_recipe_payload("r-1", ["flour", "salt"]))
    # flour is in stock; salt is not in the pantry
    client.post("/pantry", json={"id": "", "name": "flour"})

    body = client.post(
        "/shopping-list/generate", json={"recipe_ids": ["r-1"]}
    ).json()
    items = {
        item["name"]: item
        for group in body["groups"]
        for item in group["items"]
    }
    assert set(items) == {"flour", "salt"}
    assert items["flour"]["pantry_covered"] is True
    assert items["salt"]["pantry_covered"] is False


def test_pantry_low_item_shown_with_flag(client: TestClient) -> None:
    """A low pantry item stays visible with pantry_low set."""
    client.post("/recipes", json=_recipe_payload("r-1", ["flour"]))
    created = client.post("/pantry", json={"id": "", "name": "flour"}).json()
    client.patch(f"/pantry/{created['id']}/status", json={"status": "low"})

    body = client.post(
        "/shopping-list/generate", json={"recipe_ids": ["r-1"]}
    ).json()
    flour = body["groups"][0]["items"][0]
    assert flour["name"] == "flour"
    assert flour["pantry_low"] is True
    assert flour["pantry_covered"] is False


def test_pantry_status_change_refreshes_shopping_list(client: TestClient) -> None:
    """Changing pantry status updates the shopping item's pantry_covered flag."""
    client.post("/recipes", json=_recipe_payload("r-1", ["flour"]))
    pantry_item = client.post("/pantry", json={"id": "", "name": "flour"}).json()
    client.post("/shopping-list/generate", json={"recipe_ids": ["r-1"]})

    # In stock: flour stays on the list, flagged as covered
    flour = client.get("/shopping-list").json()["groups"][0]["items"][0]
    assert flour["name"] == "flour"
    assert flour["pantry_covered"] is True

    # Mark it out — flour becomes a plain to-buy item
    client.patch(f"/pantry/{pantry_item['id']}/status", json={"status": "out"})
    flour = client.get("/shopping-list").json()["groups"][0]["items"][0]
    assert flour["pantry_covered"] is False


def test_delete_shopping_checked(client: TestClient) -> None:
    """DELETE /shopping-list/checked removes checked items and stocks pantry."""
    keep = client.post(
        "/shopping-list/items", json={"id": "", "name": "milk"}
    ).json()
    drop = client.post(
        "/shopping-list/items", json={"id": "", "name": "eggs"}
    ).json()
    client.patch(
        f"/shopping-list/items/{drop['id']}/check", json={"checked": True}
    )

    response = client.delete("/shopping-list/checked")
    assert response.status_code == 200
    payload = response.json()
    assert payload["removed"] == 1
    assert payload["pantry_added"] == 1

    remaining = [
        item["id"]
        for group in client.get("/shopping-list").json()["groups"]
        for item in group["items"]
    ]
    assert remaining == [keep["id"]]

    pantry_names = {item["name"] for item in client.get("/pantry").json()}
    assert "eggs" in pantry_names
    assert "milk" not in pantry_names  # unchecked item not stocked


def test_delete_shopping_checked_refreshes_existing_pantry_item(
    client: TestClient,
) -> None:
    """Buying an item already in the pantry refreshes it to in_stock."""
    existing = client.post("/pantry", json={"id": "", "name": "butter"}).json()
    client.patch(f"/pantry/{existing['id']}/status", json={"status": "out"})

    item = client.post(
        "/shopping-list/items", json={"id": "", "name": "butter"}
    ).json()
    client.patch(
        f"/shopping-list/items/{item['id']}/check", json={"checked": True}
    )

    payload = client.delete("/shopping-list/checked").json()
    assert payload["pantry_updated"] == 1
    assert payload["pantry_added"] == 0

    butter = next(
        p for p in client.get("/pantry").json() if p["name"] == "butter"
    )
    assert butter["status"] == "in_stock"


def test_complete_shopping_stocks_pantry_and_clears(client: TestClient) -> None:
    """POST /shopping-list/complete moves the whole list into the pantry."""
    client.post("/shopping-list/items", json={"id": "", "name": "milk"})
    client.post("/shopping-list/items", json={"id": "", "name": "eggs"})

    response = client.post("/shopping-list/complete")
    assert response.status_code == 200
    payload = response.json()
    assert payload["removed"] == 2
    assert payload["pantry_added"] == 2

    assert client.get("/shopping-list").json()["total_visible"] == 0
    pantry_names = {item["name"] for item in client.get("/pantry").json()}
    assert {"milk", "eggs"} <= pantry_names


# --- Meal-plan endpoints ---


def test_get_meal_plan_empty_when_none(client: TestClient) -> None:
    """GET /meal-plans/{week} returns an empty plan when none is stored."""
    response = client.get("/meal-plans/2026-05-18")
    assert response.status_code == 200
    body = response.json()
    assert body["week_of"] == "2026-05-18"
    assert body["meals"] == []


def test_put_then_get_meal_plan(client: TestClient) -> None:
    """PUT a meal plan and GET returns the stored meals."""
    plan = {
        "week_of": "2026-05-18",
        "meals": [
            {"day_index": 0, "recipe_id": "r-1"},
            {"day_index": 2, "recipe_id": "r-2"},
        ],
    }
    put = client.put("/meal-plans/2026-05-18", json=plan)
    assert put.status_code == 200
    assert len(put.json()["meals"]) == 2

    body = client.get("/meal-plans/2026-05-18").json()
    assert len(body["meals"]) == 2
    assert body["meals"][0]["recipe_id"] == "r-1"
    assert body["meals"][1]["recipe_id"] == "r-2"


def test_put_meal_plan_allows_multiple_recipes_per_day(
    client: TestClient,
) -> None:
    """A day can hold any number of recipes, including duplicates."""
    plan = {
        "week_of": "2026-05-18",
        "meals": [
            {"day_index": 4, "recipe_id": "main"},
            {"day_index": 4, "recipe_id": "dessert"},
            {"day_index": 4, "recipe_id": "main"},
        ],
    }
    put = client.put("/meal-plans/2026-05-18", json=plan)
    assert put.status_code == 200

    body = client.get("/meal-plans/2026-05-18").json()
    day_four = [m["recipe_id"] for m in body["meals"] if m["day_index"] == 4]
    assert day_four == ["main", "dessert", "main"]


def test_put_meal_plan_replaces_week(client: TestClient) -> None:
    """A second PUT for the same week replaces the previous plan."""
    client.put(
        "/meal-plans/2026-05-18",
        json={
            "week_of": "2026-05-18",
            "meals": [{"day_index": 0, "recipe_id": "old"}],
        },
    )
    client.put(
        "/meal-plans/2026-05-18",
        json={
            "week_of": "2026-05-18",
            "meals": [{"day_index": 1, "recipe_id": "new"}],
        },
    )

    body = client.get("/meal-plans/2026-05-18").json()
    assert len(body["meals"]) == 1
    assert body["meals"][0]["recipe_id"] == "new"


def test_put_meal_plan_path_week_wins(client: TestClient) -> None:
    """The week_of in the path takes precedence over the request body."""
    response = client.put(
        "/meal-plans/2026-05-18",
        json={"week_of": "1999-01-01", "meals": []},
    )
    assert response.status_code == 200
    assert response.json()["week_of"] == "2026-05-18"


def test_put_meal_plan_rejects_bad_day_index(client: TestClient) -> None:
    """A day_index outside 0-6 is rejected by validation."""
    response = client.put(
        "/meal-plans/2026-05-18",
        json={
            "week_of": "2026-05-18",
            "meals": [{"day_index": 9, "recipe_id": "r-1"}],
        },
    )
    assert response.status_code == 422
