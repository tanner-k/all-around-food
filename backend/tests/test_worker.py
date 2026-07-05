"""Tests for the import-queue worker loop and per-kind dispatch.

No real Anthropic / Qwen / network access: the parsers, video importer, receipt
pipeline, and shopping-list logic are monkeypatched, and Supabase is a
``FakeSupabaseClient`` that records every call. The tests assert, per ``kind``,
that the right parser ran, the right insert helper fired, ``mark_done`` carried
the right ``result_recipe_id``, and that a parser exception routes to
``mark_error`` without aborting sibling jobs. Idempotency and the eval toggle
are covered too.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import SecretStr

from allaroundfood import worker
from allaroundfood.models import Recipe, ShoppingListItem
from allaroundfood.parsing.recipe_parser import RecipeParseResult

USER_ID = "user-123"


def _run(client: FakeSupabaseClient, job: dict[str, Any]) -> bool:
    """Call ``worker.process_job`` with the fake client (typed as the real one)."""
    return worker.process_job(cast(Any, client), job)


def _drain(client: FakeSupabaseClient, limit: int) -> int:
    """Call ``worker.drain_once`` with the fake client (typed as the real one)."""
    return worker.drain_once(cast(Any, client), limit)


# ── Fakes ────────────────────────────────────────────────────────────────────


class FakeSupabaseClient:
    """Records the worker's write calls; a stand-in for a service-role client."""

    def __init__(self) -> None:
        self.done: list[tuple[str, str | None]] = []
        self.errors: list[tuple[str, str]] = []
        self.recipes: list[tuple[Recipe, str]] = []
        self.receipts: list[tuple[Any, str]] = []
        self.shopping_items: list[tuple[list[ShoppingListItem], str]] = []
        self.evaluations: list[tuple[dict[str, Any], str]] = []


def _make_recipe(title: str = "Test") -> Recipe:
    return Recipe(
        id="",
        title=title,
        ingredients=[
            {  # type: ignore[list-item]
                "name": "flour",
                "quantity": {"value": 1.0, "unit": "cup", "as_written": "1 cup"},
            }
        ],
        steps=[{"order": 1, "instruction": "Mix."}],  # type: ignore[list-item]
        parse_confidence=0.9,
    )


def _parse_result(recipe: Recipe, stripped: str | None = None) -> RecipeParseResult:
    return RecipeParseResult(
        recipe=recipe, worker_prompt="SYSTEM:\nprompt", stripped_text=stripped
    )


@pytest.fixture
def patched_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route the worker's supabase helpers into the FakeSupabaseClient records."""

    def _insert_recipe(client: FakeSupabaseClient, recipe: Recipe, user_id: str) -> str:
        client.recipes.append((recipe, user_id))
        return "recipe-abc"

    def _insert_receipt(client: FakeSupabaseClient, receipt: Any, user_id: str) -> str:
        client.receipts.append((receipt, user_id))
        return "receipt-abc"

    def _insert_shopping_items(
        client: FakeSupabaseClient, items: list[ShoppingListItem], user_id: str
    ) -> list[str]:
        client.shopping_items.append((items, user_id))
        return [i.id for i in items]

    def _insert_evaluation(
        client: FakeSupabaseClient, evaluation: dict[str, Any], user_id: str
    ) -> str:
        client.evaluations.append((evaluation, user_id))
        return "eval-abc"

    def _mark_done(
        client: FakeSupabaseClient, job_id: str, result_recipe_id: str | None = None
    ) -> None:
        client.done.append((job_id, result_recipe_id))

    def _mark_error(client: FakeSupabaseClient, job_id: str, message: str) -> None:
        client.errors.append((job_id, message))

    def _download_import(client: FakeSupabaseClient, storage_path: str) -> bytes:
        return b"raw-bytes"

    monkeypatch.setattr(worker, "insert_recipe", _insert_recipe)
    monkeypatch.setattr(worker, "insert_receipt", _insert_receipt)
    monkeypatch.setattr(worker, "insert_shopping_items", _insert_shopping_items)
    monkeypatch.setattr(worker, "insert_evaluation", _insert_evaluation)
    monkeypatch.setattr(worker, "mark_done", _mark_done)
    monkeypatch.setattr(worker, "mark_error", _mark_error)
    monkeypatch.setattr(worker, "download_import", _download_import)


def _job(kind: str, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": f"job-{kind}",
        "kind": kind,
        "user_id": USER_ID,
        "source_url": None,
        "storage_path": None,
        "payload_text": None,
        "result_recipe_id": None,
        "status": "processing",
        "attempts": 1,
    }
    base.update(overrides)
    return base


# ── Recipe-kind dispatch (url / video / screenshot) ──────────────────────────


class TestRecipeKinds:
    def test_url_dispatch(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        recipe = _make_recipe("URL Recipe")
        called: dict[str, Any] = {}

        def _fake(url: str) -> RecipeParseResult:
            called["url"] = url
            return _parse_result(recipe, stripped="stripped text")

        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_url", _fake
        )
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        job = _job("url", source_url="https://ex.test/r")
        assert _run(client, job) is True

        assert called["url"] == "https://ex.test/r"
        assert client.recipes == [(recipe, USER_ID)]
        assert client.done == [("job-url", "recipe-abc")]
        assert client.errors == []

    def test_video_dispatch(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        recipe = _make_recipe("Video Recipe")
        seen: dict[str, Any] = {}

        class _Vid:
            caption = "cap"
            transcript = "trans"
            source_url = "https://tiktok.com/x"

        async def _fetch(url: str) -> _Vid:
            seen["fetched"] = url
            return _Vid()

        def _validate(url: str) -> str:
            seen["validated"] = url
            return "tiktok"

        def _parse(caption: str, transcript: str, source_url: str) -> RecipeParseResult:
            seen["parse"] = (caption, transcript, source_url)
            return _parse_result(recipe, stripped="CAPTION:\ncap")

        monkeypatch.setattr("allaroundfood.video_import.fetch_video_text", _fetch)
        monkeypatch.setattr("allaroundfood.video_import.validate_video_url", _validate)
        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_video_text", _parse
        )
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        job = _job("video", source_url="https://tiktok.com/x")
        assert _run(client, job) is True

        assert seen["validated"] == "https://tiktok.com/x"
        assert seen["fetched"] == "https://tiktok.com/x"
        assert seen["parse"] == ("cap", "trans", "https://tiktok.com/x")
        assert client.recipes == [(recipe, USER_ID)]
        assert client.done == [("job-video", "recipe-abc")]

    def test_screenshot_dispatch_infers_media_type(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        recipe = _make_recipe("Shot Recipe")
        seen: dict[str, Any] = {}

        def _fake(data: bytes, media_type: str) -> RecipeParseResult:
            seen["data"] = data
            seen["media_type"] = media_type
            return _parse_result(recipe)

        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_image", _fake
        )
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        job = _job("screenshot", storage_path=f"{USER_ID}/abc.png")
        assert _run(client, job) is True

        assert seen["data"] == b"raw-bytes"
        assert seen["media_type"] == "image/png"  # inferred from .png
        assert client.done == [("job-screenshot", "recipe-abc")]

    def test_media_type_defaults_to_jpeg(self) -> None:
        assert worker._media_type_for(_job("screenshot", storage_path="x/y.bin")) == (
            "image/jpeg"
        )
        assert worker._media_type_for(
            _job("screenshot", storage_path="x/y.webp")
        ) == "image/webp"


# ── Receipt + shopping-list dispatch ─────────────────────────────────────────


class TestReceiptAndShopping:
    def test_receipt_dispatch(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        sentinel_receipt = object()

        class _FakeParser:
            def parse(self, preprocessed: Any) -> Any:
                return sentinel_receipt

        monkeypatch.setattr(
            "allaroundfood.ocr.deps.get_receipt_parser", lambda: _FakeParser()
        )
        monkeypatch.setattr(
            "allaroundfood.ocr.preprocess.preprocess_receipt",
            lambda path, output_dir=None: object(),
        )
        # Observation mapping is best-effort; force it to no-op.
        monkeypatch.setattr(worker, "_write_receipt_observations", lambda r: 0)

        client = FakeSupabaseClient()
        job = _job("receipt", storage_path=f"{USER_ID}/receipt.jpg")
        assert _run(client, job) is True

        assert client.receipts == [(sentinel_receipt, USER_ID)]
        assert client.done == [("job-receipt", None)]
        assert client.errors == []

    def test_shopping_list_from_text(self, patched_helpers: None) -> None:
        client = FakeSupabaseClient()
        text = "- milk (1 gal)\n2 lemons\nchicken breast, 1 lb\n\n"
        job = _job("shopping_list", payload_text=text)
        assert _run(client, job) is True

        assert len(client.shopping_items) == 1
        items, user_id = client.shopping_items[0]
        assert user_id == USER_ID
        by_name = {i.name: i for i in items}
        assert by_name["milk"].quantity_text == "1 gal"
        assert by_name["milk"].aisle == "Dairy"
        assert by_name["chicken breast"].quantity_text == "1 lb"
        assert by_name["chicken breast"].aisle == "Meat"
        assert "2 lemons" in by_name  # bare line, no quantity split
        assert client.done == [("job-shopping_list", None)]

    def test_shopping_list_from_storage(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        monkeypatch.setattr(
            worker, "download_import", lambda client, path: b"eggs\nbread\n"
        )
        client = FakeSupabaseClient()
        job = _job("shopping_list", storage_path=f"{USER_ID}/list.txt")
        assert _run(client, job) is True

        items, _ = client.shopping_items[0]
        names = {i.name for i in items}
        assert names == {"eggs", "bread"}


# ── Error isolation, idempotency, unknown kind ───────────────────────────────


class TestErrorHandling:
    def test_parser_exception_routes_to_mark_error_without_aborting_siblings(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        good_recipe = _make_recipe("Good")

        def _url(url: str) -> RecipeParseResult:
            return _parse_result(good_recipe)

        def _image(data: bytes, media_type: str) -> RecipeParseResult:
            raise RuntimeError("boom parsing image")

        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_url", _url
        )
        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_image", _image
        )
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        bad = _job("screenshot", id="bad", storage_path="u/x.jpg")
        good = _job("url", id="good", source_url="https://ex.test/r")

        # Bad job first: it must not prevent the good job from succeeding.
        assert _run(client, bad) is False
        assert _run(client, good) is True

        assert client.errors == [("bad", "boom parsing image")]
        assert client.done == [("good", "recipe-abc")]
        assert len(client.recipes) == 1

    def test_unknown_kind_marks_error(self, patched_helpers: None) -> None:
        client = FakeSupabaseClient()
        job = _job("mystery", id="weird")
        assert _run(client, job) is False
        assert client.errors and client.errors[0][0] == "weird"
        assert "unknown job kind" in client.errors[0][1]

    def test_idempotent_job_is_skipped(self, patched_helpers: None) -> None:
        client = FakeSupabaseClient()
        job = _job("url", id="dup", result_recipe_id="already-here")
        assert _run(client, job) is True

        # No parse / insert happened; just a mark_done relinking the recipe.
        assert client.recipes == []
        assert client.done == [("dup", "already-here")]
        assert client.errors == []


# ── Eval toggle (fire-and-forget) ────────────────────────────────────────────


class TestEvals:
    def _patch_url(self, monkeypatch: pytest.MonkeyPatch, recipe: Recipe) -> None:
        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_url",
            lambda url: _parse_result(recipe, stripped="stripped text"),
        )

    def test_run_evals_false_skips_insert_evaluation(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        self._patch_url(monkeypatch, _make_recipe())
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        _run(client, _job("url", source_url="https://ex.test/r"))

        assert client.evaluations == []
        assert client.done == [("job-url", "recipe-abc")]

    def test_run_evals_true_calls_insert_evaluation(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        self._patch_url(monkeypatch, _make_recipe())
        monkeypatch.setattr(worker.settings, "run_evals", True, raising=False)

        class _Grade:
            verdict = {
                "overall_grade": 8,
                "accuracy_grade": 9,
                "completeness_grade": 7,
                "strengths": [],
                "weaknesses": [],
                "field_checks": [],
                "reasoning": "ok",
                "suggested_prompt_improvements": None,
            }
            judge_prompt = "judge prompt"
            raw_judge_output = "{}"

        monkeypatch.setattr(
            "allaroundfood.parsing.judge.grade_recipe_parse",
            lambda **kwargs: _Grade(),
        )

        client = FakeSupabaseClient()
        _run(client, _job("url", source_url="https://ex.test/r"))

        assert len(client.evaluations) == 1
        evaluation, user_id = client.evaluations[0]
        assert user_id == USER_ID
        assert evaluation["overall_grade"] == 8
        assert evaluation["worker_model"] == "claude-haiku-4-5"
        assert evaluation["judge_model"] == "claude-sonnet-4-6"
        # The job still completed successfully.
        assert client.done == [("job-url", "recipe-abc")]

    def test_judge_exception_is_swallowed_and_job_still_done(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        self._patch_url(monkeypatch, _make_recipe())
        monkeypatch.setattr(worker.settings, "run_evals", True, raising=False)

        def _boom(**kwargs: Any) -> Any:
            raise RuntimeError("judge exploded")

        monkeypatch.setattr("allaroundfood.parsing.judge.grade_recipe_parse", _boom)

        client = FakeSupabaseClient()
        assert (
            _run(client, _job("url", source_url="https://ex.test/r"))
            is True
        )

        # Judge error swallowed: no evaluation, no job error, job still done.
        assert client.evaluations == []
        assert client.errors == []
        assert client.done == [("job-url", "recipe-abc")]


# ── Drain loop + CLI ─────────────────────────────────────────────────────────


class TestDrainAndCli:
    def test_drain_once_processes_each_claimed_job(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        jobs = [
            _job("url", id="j1", source_url="https://ex.test/1"),
            _job("url", id="j2", source_url="https://ex.test/2"),
        ]
        monkeypatch.setattr(
            "allaroundfood.supabase_client.claim_pending_jobs",
            lambda client, limit, max_attempts: jobs,
        )
        recovered: dict[str, Any] = {}

        def _recover(
            client: Any, stale_after_minutes: int, max_attempts: int
        ) -> list[dict[str, Any]]:
            recovered["stale_after_minutes"] = stale_after_minutes
            recovered["max_attempts"] = max_attempts
            return [{"id": "stale"}]

        monkeypatch.setattr("allaroundfood.supabase_client.recover_stale_jobs", _recover)
        monkeypatch.setattr(
            "allaroundfood.parsing.recipe_parser.parse_recipe_from_url",
            lambda url: _parse_result(_make_recipe()),
        )
        monkeypatch.setattr(worker.settings, "run_evals", False, raising=False)

        client = FakeSupabaseClient()
        assert _drain(client, 10) == 2
        assert {d[0] for d in client.done} == {"j1", "j2"}
        assert recovered["stale_after_minutes"] == worker.settings.worker_stale_after_minutes
        assert recovered["max_attempts"] == worker.settings.worker_max_attempts

    def test_main_returns_2_on_missing_creds(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _raise() -> Any:
            raise RuntimeError("SUPABASE_URL ... must be set")

        monkeypatch.setattr(worker, "get_service_client", _raise)
        assert worker.main(["--once"]) == 2

    def test_main_once_drains(
        self, monkeypatch: pytest.MonkeyPatch, patched_helpers: None
    ) -> None:
        client = FakeSupabaseClient()
        monkeypatch.setattr(worker, "get_service_client", lambda: client)
        drained: dict[str, Any] = {}

        def _drain(c: Any, limit: int) -> int:
            drained["limit"] = limit
            return 0

        monkeypatch.setattr(worker, "drain_once", _drain)
        assert worker.main(["--once", "--limit", "5"]) == 0
        assert drained["limit"] == 5

    def test_doctor_checks_without_supabase_client(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        qwen = tmp_path / "qwen.gguf"
        qwen.write_text("model", encoding="utf-8")

        monkeypatch.setattr(worker.settings, "supabase_url", "https://supabase.test")
        monkeypatch.setattr(
            worker.settings,
            "supabase_service_role_key",
            SecretStr("service-role"),
        )
        monkeypatch.setattr(
            worker.settings,
            "anthropic_api_key_parsing",
            SecretStr("anthropic"),
        )
        monkeypatch.setattr(worker.settings, "qwen_gguf_path", qwen)
        monkeypatch.setattr(worker.settings, "whisper_models_dir", tmp_path)
        monkeypatch.setattr(
            worker,
            "get_service_client",
            lambda: (_ for _ in ()).throw(AssertionError("should not connect")),
        )

        from allaroundfood.video_import import VideoImportBinaryStatus

        monkeypatch.setattr(
            "allaroundfood.video_import.check_video_import_binaries",
            lambda settings=None: VideoImportBinaryStatus(
                ytdlp="/opt/bin/yt-dlp", ffmpeg="/opt/bin/ffmpeg"
            ),
        )

        assert worker.main(["--doctor"]) == 0
        out = capsys.readouterr().out
        assert "ok   SUPABASE_URL" in out
        assert "ok   QWEN_GGUF_PATH" in out

    def test_prefetch_models_without_supabase_client(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        qwen = tmp_path / "qwen.gguf"
        qwen.write_text("model", encoding="utf-8")
        whisper_dir = tmp_path / "whisper"
        loaded: dict[str, Any] = {}

        class _FakeTranscriber:
            def __init__(self, model: str, models_dir: Path | None) -> None:
                loaded["model"] = model
                loaded["models_dir"] = models_dir

            def _load(self) -> object:
                loaded["called"] = True
                return object()

        monkeypatch.setattr(worker.settings, "qwen_gguf_path", qwen)
        monkeypatch.setattr(worker.settings, "whisper_model", "base.en")
        monkeypatch.setattr(worker.settings, "whisper_models_dir", whisper_dir)
        monkeypatch.setattr(
            "allaroundfood.transcription.WhisperCppTranscriber",
            _FakeTranscriber,
        )
        monkeypatch.setattr(
            worker,
            "get_service_client",
            lambda: (_ for _ in ()).throw(AssertionError("should not connect")),
        )

        assert worker.main(["--prefetch-models"]) == 0
        assert loaded == {
            "model": "base.en",
            "models_dir": whisper_dir,
            "called": True,
        }
        assert whisper_dir.exists()
        out = capsys.readouterr().out
        assert "ok   whisper base.en" in out
        assert "ok   QWEN_GGUF_PATH" in out
