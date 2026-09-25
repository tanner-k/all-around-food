"""The personal worker publishes fenced drafts without cloud recipe writes."""

from __future__ import annotations

import subprocess
import sys
from typing import Any

import pytest

from allaroundfood import worker
from allaroundfood.config import Settings
from allaroundfood.models import Recipe
from allaroundfood.parsing.recipe_parser import RecipeParseResult


def recipe() -> Recipe:
    return Recipe(
        id="",
        title="Soup",
        ingredients=[{"name": "peas", "quantity": {"value": None, "unit": None, "as_written": ""}}],
        steps=[{"order": 1, "instruction": "Boil peas."}],
    )  # type: ignore[list-item]


def job(**changes: Any) -> dict[str, Any]:
    result = {
        "id": "draft-1",
        "kind": "text",
        "user_id": "owner",
        "claim_token": "claim-1",
        "payload_text": "Peas. Boil peas.",
        "attempts": 1,
        "result_recipe_json": None,
        "result_recipe_id": None,
    }
    result.update(changes)
    return result


@pytest.fixture(autouse=True)
def renew(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "renew_import_job", lambda *args: None)


def test_text_publishes_fenced_draft_without_cloud_recipe_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    published: list[dict[str, Any]] = []

    class Client:
        def rpc(self, name: str, params: dict[str, Any]) -> Client:
            assert name == "finish_import_job"
            published.append(params)
            events.append("finish")
            return self

        def execute(self) -> None:
            return None

    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner", raising=False)
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(recipe(), "prompt", text),
    )
    monkeypatch.setattr(
        "allaroundfood.supabase_client.insert_recipe",
        lambda *args: pytest.fail("cloud recipe write"),
    )
    monkeypatch.setattr(worker, "cleanup_import_jobs", lambda client: events.append("cleanup"))
    assert worker.process_job(Client(), job()) is True  # type: ignore[arg-type]
    assert events == ["finish"]
    assert published[0]["p_recipe"]["id"] == "draft-1"
    assert published[0]["p_recipe"]["ingredients"][0]["quantity"]["value"] is None
    assert published[0]["p_claim_token"] == "claim-1"


def test_parser_warnings_are_published_with_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    found: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(recipe(), "jev", text, ["Amount uncertain"]),
    )
    monkeypatch.setattr(
        worker, "finish_import_job",
        lambda client, job_id, token, value, warnings: found.extend(warnings),
    )
    assert worker.process_job(object(), job())  # type: ignore[arg-type]
    assert found == ["Amount uncertain"]


def test_active_worker_never_runs_legacy_eval(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(worker.settings, "run_evals", True)
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(recipe(), "jev", text),
    )
    monkeypatch.setattr(worker, "_run_eval", lambda *args: pytest.fail("legacy eval called"))
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: None)
    assert worker.process_job(object(), job())  # type: ignore[arg-type]


def test_other_owner_rejected_before_source_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner", raising=False)
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_url",
        lambda url: pytest.fail("fetched"),
    )
    monkeypatch.setattr(worker, "fail_import_job", lambda *args: None)
    assert (
        worker.process_job(
            object(), job(kind="url", user_id="other", source_url="https://example.com")
        )
        is False
    )  # type: ignore[arg-type]


def test_old_recipe_id_is_not_republished(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner", raising=False)
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: pytest.fail("republished"))
    assert worker.process_job(object(), job(result_recipe_id="old-id")) is True  # type: ignore[arg-type]


def test_existing_draft_is_not_reparsed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: pytest.fail("republished"))
    assert worker.process_job(object(), job(result_recipe_json={"title": "Saved"}))  # type: ignore[arg-type]


def test_parser_error_is_fenced_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    errors: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner", raising=False)
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: (_ for _ in ()).throw(ValueError("insufficient evidence")),
    )
    monkeypatch.setattr(
        worker, "fail_import_job", lambda client, job_id, token, message: errors.append(message)
    )
    assert worker.process_job(object(), job()) is False  # type: ignore[arg-type]
    assert errors == ["insufficient evidence"]


def test_blank_ingredient_or_step_is_recoverable_error(monkeypatch: pytest.MonkeyPatch) -> None:
    errors: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    incomplete = recipe().model_copy(deep=True)
    incomplete.ingredients[0].name = " "
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(incomplete, "prompt"),
    )
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: pytest.fail("published"))
    monkeypatch.setattr(worker, "fail_import_job", lambda *args: errors.append(args[3]))
    assert not worker.process_job(object(), job())  # type: ignore[arg-type]
    assert "Insufficient" in errors[0]


def test_caption_only_video_warns_without_claiming_screen_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from allaroundfood.models import VideoImportResult

    warnings: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr("allaroundfood.video_import.validate_video_url", lambda url: "tiktok")

    async def fetch(url: str) -> VideoImportResult:
        return VideoImportResult(
            source_url=url, platform="tiktok", caption="Peas. Boil peas.", transcript=""
        )

    monkeypatch.setattr("allaroundfood.video_import.fetch_video_text", fetch)
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_video_text",
        lambda **kwargs: RecipeParseResult(recipe(), "prompt"),
    )
    monkeypatch.setattr(
        worker,
        "finish_import_job",
        lambda client, job_id, token, value, found: warnings.extend(found),
    )
    assert worker.process_job(object(), job(kind="video", source_url="https://tiktok.com/x"))  # type: ignore[arg-type]
    assert len(warnings) == 1
    assert "on-screen text was not extracted" in warnings[0]


def test_failed_publication_does_not_cleanup_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_image",
        lambda *args: RecipeParseResult(recipe(), "prompt"),
    )
    monkeypatch.setattr(worker, "download_import", lambda *args: b"image")

    def crash(*args: Any) -> None:
        events.append("finish")
        raise RuntimeError("network lost before finish")

    monkeypatch.setattr(worker, "finish_import_job", crash)
    monkeypatch.setattr(worker, "fail_import_job", lambda *args: events.append("fail"))
    monkeypatch.setattr(worker, "cleanup_import_jobs", lambda *args: events.append("cleanup"))
    assert not worker.process_job(object(), job(kind="screenshot", storage_path="owner/a.png"))  # type: ignore[arg-type]
    assert events == ["finish", "fail"]


def test_lost_claim_does_not_publish(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(recipe(), "prompt"),
    )
    monkeypatch.setattr(
        worker,
        "renew_import_job",
        lambda *args: (_ for _ in ()).throw(RuntimeError("import claim lost")),
    )
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: pytest.fail("stale publish"))
    monkeypatch.setattr(worker, "fail_import_job", lambda *args: None)
    assert not worker.process_job(object(), job())  # type: ignore[arg-type]


def test_cleanup_failure_does_not_block_new_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        worker, "cleanup_import_jobs", lambda client: (_ for _ in ()).throw(RuntimeError("offline"))
    )
    monkeypatch.setattr("allaroundfood.supabase_client.claim_pending_jobs", lambda *args: [])
    assert worker.drain_once(object(), 1) == 0  # type: ignore[arg-type]


def test_drain_finishes_before_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr("allaroundfood.supabase_client.claim_pending_jobs", lambda *args: [job()])
    monkeypatch.setattr(
        "allaroundfood.parsing.recipe_parser.parse_recipe_from_text",
        lambda text: RecipeParseResult(recipe(), "prompt"),
    )
    monkeypatch.setattr(worker, "finish_import_job", lambda *args: events.append("finish"))
    monkeypatch.setattr(worker, "cleanup_import_jobs", lambda *args: events.append("cleanup"))
    assert worker.drain_once(object(), 1) == 1  # type: ignore[arg-type]
    assert events == ["finish", "cleanup"]


def test_drain_claims_next_job_only_after_previous_is_processed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    pending = iter([job(id="first"), job(id="second")])

    def claim(*args: Any) -> list[dict[str, Any]]:
        item = next(pending)
        events.append(f"claim:{item['id']}")
        return [item]

    monkeypatch.setattr("allaroundfood.supabase_client.claim_pending_jobs", claim)
    monkeypatch.setattr(
        worker, "process_job", lambda client, item: events.append(f"process:{item['id']}")
    )
    monkeypatch.setattr(worker, "cleanup_import_jobs", lambda client: None)

    assert worker.drain_once(object(), 2) == 2  # type: ignore[arg-type]
    assert events == ["claim:first", "process:first", "claim:second", "process:second"]


def test_exhausted_job_is_not_processed_when_claim_rpc_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("allaroundfood.supabase_client.claim_pending_jobs", lambda *args: [])
    monkeypatch.setattr(worker, "cleanup_import_jobs", lambda *args: [])
    monkeypatch.setattr(worker, "process_job", lambda *args: pytest.fail("unclaimed job"))
    assert worker.drain_once(object(), 1) == 0  # type: ignore[arg-type]


def test_recipe_only_worker_import_does_not_load_ocr_or_torch() -> None:
    code = """
import builtins
original = builtins.__import__
def guard(name, *args, **kwargs):
    if name.startswith(('torch', 'allaroundfood.ocr')):
        raise AssertionError('recipe startup loaded OCR dependencies')
    return original(name, *args, **kwargs)
builtins.__import__ = guard
import allaroundfood.worker as worker
worker.settings.import_owner_user_id = 'owner'
worker.get_service_client = lambda: object()
worker.drain_once = lambda client, limit: 0
assert worker.main(['--once']) == 0
"""
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=10, check=False
    )
    assert result.returncode == 0, result.stderr


def test_old_worker_environment_keys_remain_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VIDEO_IMPORT_TIMEOUT_S", "240")
    monkeypatch.setenv("WORKER_STALE_AFTER_MINUTES", "15")
    active = Settings(_env_file=None)
    assert active.video_import_timeout_s == 240
    assert active.worker_stale_after_minutes == 15
    assert active.run_evals is False


def test_worker_refuses_start_without_import_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker.settings, "import_owner_user_id", None)
    monkeypatch.setattr(worker, "get_service_client", lambda: pytest.fail("opened Supabase"))
    assert worker.main(["--once"]) == 2


def test_watch_uses_bounded_network_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    delays: list[float] = []
    calls = 0
    monkeypatch.setattr(worker.settings, "import_owner_user_id", "owner")
    monkeypatch.setattr(worker, "get_service_client", lambda: object())

    def drain(client: Any, limit: int) -> int:
        nonlocal calls
        calls += 1
        if calls == 7:
            raise KeyboardInterrupt
        raise ConnectionError("Mac offline")

    monkeypatch.setattr(worker, "drain_once", drain)
    monkeypatch.setattr(worker.time, "sleep", delays.append)
    assert worker.main(["--watch"]) == 0
    assert delays == [5, 10, 20, 40, 60, 60]
