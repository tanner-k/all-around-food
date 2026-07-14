"""Tests for the queue-v2 worker (ADR 0008): cache hit/miss, dispatch, failure.

No real Anthropic / network access: parsers and the video importer are
monkeypatched; Supabase is faked at the helper seams (the worker imports its
collaborators as module-level names, which the tests monkeypatch onto the
``worker`` module namespace).
"""

from __future__ import annotations

from typing import Any, cast

import pytest

from allaroundfood import worker
from allaroundfood.config import settings
from allaroundfood.models import Ingredient, Quantity, Recipe, Step
from allaroundfood.parsing.recipe_parser import RecipeParseResult
from allaroundfood.video_import import VideoImportError


def _make_recipe(title: str = "Test") -> Recipe:
    return Recipe(
        id="",
        title=title,
        ingredients=[Ingredient(name="x", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="do it")],
    )


def _parse_result(title: str = "Test") -> RecipeParseResult:
    return RecipeParseResult(
        recipe=_make_recipe(title), worker_prompt="PROMPT", stripped_text="TEXT"
    )


def _not_video(url: str) -> Any:
    raise VideoImportError("unsupported")


class FakeSupabase:
    """Records helper-level calls; results keyed by normalized URL."""

    def __init__(self, cached: dict[str, dict[str, Any]] | None = None) -> None:
        self.cached = cached or {}
        self.upserts: list[tuple[str, Recipe, str | None]] = []
        self.done: list[tuple[str, str]] = []
        self.failed: list[tuple[str, str]] = []
        self.downloads: list[str] = []


@pytest.fixture()
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(worker, "lookup_parse_result", lambda c, url: fake.cached.get(url))
    monkeypatch.setattr(
        worker,
        "upsert_parse_result",
        lambda c, url, recipe, transcript: fake.upserts.append((url, recipe, transcript)),
    )
    monkeypatch.setattr(worker, "mark_job_done", lambda c, jid, url: fake.done.append((jid, url)))
    monkeypatch.setattr(
        worker, "mark_job_failed", lambda c, jid, msg: fake.failed.append((jid, msg))
    )
    def fake_download(c: Any, path: str) -> bytes:
        fake.downloads.append(path)
        return b"IMAGEBYTES"

    monkeypatch.setattr(worker, "download_import", fake_download)
    monkeypatch.setattr(settings, "run_evals", False)
    return fake


def _run(fake: FakeSupabase, job: dict[str, Any]) -> bool:
    return worker.process_job(cast(Any, object()), job)


def test_url_cache_hit_marks_done_without_parsing(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake.cached["https://x.com/a"] = {"normalized_url": "https://x.com/a", "recipe": {}}
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")

    def boom(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("must not parse on a cache hit")

    monkeypatch.setattr(worker, "parse_recipe_from_url", boom)
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a?utm_source=z"})
    assert fake.done == [("j1", "https://x.com/a")]
    assert fake.upserts == []


def test_url_cache_miss_parses_and_upserts(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "validate_video_url", _not_video)
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result("Web"))
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert len(fake.upserts) == 1
    url, recipe, transcript = fake.upserts[0]
    assert url == "https://x.com/a" and recipe.title == "Web" and transcript is None
    assert fake.done == [("j1", "https://x.com/a")]


def test_video_url_routes_to_video_parser(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    video_url = "https://www.tiktok.com/@c/video/1"
    monkeypatch.setattr(worker, "normalize_url", lambda url: video_url)
    monkeypatch.setattr(worker, "validate_video_url", lambda url: "tiktok")

    class FakeVideo:
        caption = "cap"
        transcript = "words"
        source_url = video_url

    async def fake_fetch(url: str) -> FakeVideo:
        return FakeVideo()

    monkeypatch.setattr(worker, "fetch_video_text", fake_fetch)
    monkeypatch.setattr(
        worker,
        "parse_recipe_from_video_text",
        lambda caption, transcript, source_url: _parse_result("Video"),
    )
    assert _run(fake, {"id": "j1", "source_url": video_url})
    url, recipe, transcript = fake.upserts[0]
    assert recipe.title == "Video" and transcript == "words"


def test_non_video_url_falls_back_to_web(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://blog.com/pie")
    monkeypatch.setattr(worker, "validate_video_url", _not_video)
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result("Pie"))
    assert _run(fake, {"id": "j1", "source_url": "https://blog.com/pie"})
    assert fake.upserts[0][1].title == "Pie"


def test_screenshot_job_downloads_and_parses_image(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        worker,
        "parse_recipe_from_image",
        lambda data, media_type: _parse_result("Shot"),
    )
    job = {"id": "j1", "source_url": None, "screenshot_path": "u/abc.png"}
    assert _run(fake, job)
    assert fake.downloads == ["u/abc.png"]
    assert fake.upserts[0][0] == "screenshot:u/abc.png"
    assert fake.done == [("j1", "screenshot:u/abc.png")]


def test_parse_failure_marks_failed_not_raise(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "validate_video_url", _not_video)

    def boom(url: str) -> Any:
        raise RuntimeError("parser exploded")

    monkeypatch.setattr(worker, "parse_recipe_from_url", boom)
    assert not _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert fake.failed == [("j1", "parser exploded")]
    assert fake.done == []


def test_job_with_neither_source_fails(fake: FakeSupabase) -> None:
    assert not _run(fake, {"id": "j1", "source_url": None, "screenshot_path": None})
    assert len(fake.failed) == 1


def test_drain_processes_all_claimed_jobs(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    jobs = [
        {"id": "j1", "source_url": "https://x.com/a"},
        {"id": "j2", "source_url": None, "screenshot_path": None},  # fails
    ]
    monkeypatch.setattr(worker, "claim_pending_jobs", lambda c, limit, cap: jobs)
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "validate_video_url", _not_video)
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result())
    assert worker.drain_once(cast(Any, object()), 10) == 2
    assert len(fake.done) == 1 and len(fake.failed) == 1


def test_eval_failure_never_fails_job(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "run_evals", True)
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "validate_video_url", _not_video)
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result())

    def eval_boom(job: dict[str, Any], parse: RecipeParseResult) -> None:
        raise RuntimeError("judge down")

    monkeypatch.setattr(worker, "_run_eval", eval_boom)
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert fake.done == [("j1", "https://x.com/a")]
