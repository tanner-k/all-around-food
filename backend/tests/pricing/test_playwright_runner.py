"""Tests for the shared Playwright runner.

Browser-launch tests are skipped by default in CI because they require
``playwright install chromium`` (a ~130 MB download) to have been run.

The constructability and semaphore tests below run without launching a browser
and verify the runner's plumbing without network activity.
"""

from __future__ import annotations

import asyncio

import pytest

from allaroundfood.pricing.adapters._playwright import (
    PlaywrightFallbackError,
    PlaywrightRunner,
)


# ---------------------------------------------------------------------------
# Helper: detect whether Playwright browsers are installed
# ---------------------------------------------------------------------------


def _has_playwright_browsers() -> bool:
    """Return True if the playwright package is installed."""
    try:
        import playwright  # noqa: F401  # type: ignore[import-untyped]
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Construction — no browser required
# ---------------------------------------------------------------------------


def test_runner_can_be_constructed() -> None:
    """PlaywrightRunner must construct without raising."""
    runner = PlaywrightRunner()
    assert runner is not None


def test_runner_respects_headless_default() -> None:
    """Default headless=True must be stored."""
    runner = PlaywrightRunner()
    assert runner._headless is True  # type: ignore[attr-defined]


def test_runner_headless_can_be_overridden() -> None:
    runner = PlaywrightRunner(headless=False)
    assert runner._headless is False  # type: ignore[attr-defined]


def test_runner_semaphore_is_created() -> None:
    """Semaphore must exist and reflect max_concurrent."""
    runner = PlaywrightRunner(max_concurrent=2)
    sem = runner._semaphore  # type: ignore[attr-defined]
    assert isinstance(sem, asyncio.Semaphore)
    # asyncio.Semaphore stores the value internally
    assert sem._value == 2  # type: ignore[attr-defined]


def test_runner_semaphore_custom_concurrency() -> None:
    runner = PlaywrightRunner(max_concurrent=1)
    assert runner._semaphore._value == 1  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# PlaywrightFallbackError
# ---------------------------------------------------------------------------


def test_playwright_fallback_error_stores_url() -> None:
    exc = PlaywrightFallbackError("https://example.com/api")
    assert exc.url == "https://example.com/api"
    assert exc.cause is None


def test_playwright_fallback_error_stores_cause() -> None:
    cause = ValueError("bad json")
    exc = PlaywrightFallbackError("https://example.com/api", cause=cause)
    assert exc.cause is cause
    assert "bad json" in str(exc)


def test_playwright_fallback_error_is_runtime_error() -> None:
    exc = PlaywrightFallbackError("https://example.com")
    assert isinstance(exc, RuntimeError)


# ---------------------------------------------------------------------------
# fetch_json — browser required (skipped in CI)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not _has_playwright_browsers(),
    reason="playwright not installed — run `playwright install chromium` first",
)
@pytest.mark.asyncio
async def test_fetch_json_raises_playwright_fallback_error_on_bad_url() -> None:
    """Confirms the runner raises PlaywrightFallbackError on unreachable URLs."""
    runner = PlaywrightRunner(headless=True)
    with pytest.raises(PlaywrightFallbackError):
        # Use an intentionally unreachable address
        await runner.fetch_json("http://127.0.0.1:19999/does-not-exist", timeout_ms=3000)
