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


# ---------------------------------------------------------------------------
# Cleanup ordering — verified with fakes (no live browser needed)
# ---------------------------------------------------------------------------


def _make_fake_pw(close_order: list[str] | None = None, goto_error: Exception | None = None):  # type: ignore[return]  # noqa: ANN201
    """Build a fake playwright object hierarchy for cleanup-ordering tests.

    Returns ``(fake_pw_cm, fake_browser, fake_context)`` so callers can
    assert on call counts.  ``close_order`` (if provided) is appended to
    with ``"context"`` / ``"browser"`` as each is closed.
    """
    import json as _json
    from unittest.mock import AsyncMock, MagicMock

    # Fake response
    fake_response = MagicMock()
    fake_response.body = AsyncMock(return_value=_json.dumps({"ok": True}).encode())

    # Fake page
    fake_page = MagicMock()
    if goto_error is not None:
        fake_page.goto = AsyncMock(side_effect=goto_error)
    else:
        fake_page.goto = AsyncMock(return_value=fake_response)
    fake_page.set_extra_http_headers = AsyncMock()

    # Fake context
    fake_context = MagicMock()
    fake_context.new_page = AsyncMock(return_value=fake_page)
    fake_context.add_cookies = AsyncMock()

    async def _context_close() -> None:
        if close_order is not None:
            close_order.append("context")

    fake_context.close = AsyncMock(side_effect=_context_close)

    # Fake browser
    fake_browser = MagicMock()
    fake_browser.new_context = AsyncMock(return_value=fake_context)

    async def _browser_close() -> None:
        if close_order is not None:
            close_order.append("browser")

    fake_browser.close = AsyncMock(side_effect=_browser_close)

    # Fake chromium + pw
    fake_chromium = MagicMock()
    fake_chromium.launch = AsyncMock(return_value=fake_browser)
    fake_pw = MagicMock()
    fake_pw.chromium = fake_chromium

    # Async context manager for async_playwright()
    fake_pw_cm = MagicMock()
    fake_pw_cm.__aenter__ = AsyncMock(return_value=fake_pw)
    fake_pw_cm.__aexit__ = AsyncMock(return_value=False)

    return fake_pw_cm, fake_browser, fake_context


@pytest.mark.asyncio
async def test_fetch_json_closes_context_before_browser_on_success() -> None:
    """context.close() must be called before browser.close() on the happy path.

    A fake ``pw`` object records close-call ordering so the test runs without
    a live browser.  Live browser integration is covered by the skipped test
    above (requires ``playwright install chromium``).

    Because ``async_playwright`` and ``stealth_async`` are imported lazily
    (inside ``fetch_json``), we inject fake modules into ``sys.modules``
    rather than patching module-level names.
    """
    import sys
    from types import ModuleType
    from unittest.mock import AsyncMock, patch

    close_order: list[str] = []
    fake_pw_cm, _browser, _context = _make_fake_pw(close_order=close_order)

    # Inject fake playwright.async_api module
    fake_playwright_module = ModuleType("playwright.async_api")
    fake_playwright_module.async_playwright = lambda: fake_pw_cm  # type: ignore[attr-defined]

    # Inject fake playwright_stealth module
    fake_stealth_module = ModuleType("playwright_stealth")
    fake_stealth_module.stealth_async = AsyncMock()  # type: ignore[attr-defined]

    with patch.dict(
        sys.modules,
        {
            "playwright.async_api": fake_playwright_module,
            "playwright_stealth": fake_stealth_module,
        },
    ):
        runner = PlaywrightRunner()
        result = await runner.fetch_json("https://example.com/api")

    assert result == {"ok": True}
    assert close_order == ["context", "browser"], (
        f"Expected context closed before browser, got: {close_order}"
    )


@pytest.mark.asyncio
async def test_fetch_json_closes_browser_even_when_page_goto_raises() -> None:
    """browser.close() must be called even when an error occurs during navigation."""
    import sys
    from types import ModuleType
    from unittest.mock import AsyncMock, patch

    close_order: list[str] = []
    fake_pw_cm, _browser, _context = _make_fake_pw(
        close_order=close_order,
        goto_error=RuntimeError("navigation failed"),
    )

    fake_playwright_module = ModuleType("playwright.async_api")
    fake_playwright_module.async_playwright = lambda: fake_pw_cm  # type: ignore[attr-defined]

    fake_stealth_module = ModuleType("playwright_stealth")
    fake_stealth_module.stealth_async = AsyncMock()  # type: ignore[attr-defined]

    with patch.dict(
        sys.modules,
        {
            "playwright.async_api": fake_playwright_module,
            "playwright_stealth": fake_stealth_module,
        },
    ):
        runner = PlaywrightRunner()
        with pytest.raises(PlaywrightFallbackError):
            await runner.fetch_json("https://example.com/api")

    assert "browser" in close_order, "browser.close() must be called even after navigation error"
