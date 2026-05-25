"""Shared Playwright runner for scraping-fallback paths.

This module provides ``PlaywrightRunner``, a thin async wrapper around
``playwright-stealth`` that is shared by all unofficial adapters when their
primary JSON endpoint fails.

System dependency
-----------------
Before using this runner you must install the Chromium browser binary::

    playwright install chromium

This is a **system-level command** that downloads ~130 MB.  It is not run
automatically during ``uv sync`` — the repository owner must run it once on
each machine.

Usage::

    from allaroundfood.pricing.adapters._playwright import PlaywrightRunner

    runner = PlaywrightRunner()
    data = await runner.fetch_json(
        "https://example.com/api/data",
        cookies={"session": "abc123"},
    )

Concurrency
-----------
At most ``_MAX_CONCURRENT`` (2) Playwright browser contexts run simultaneously.
This is enforced via an ``asyncio.Semaphore`` to avoid resource exhaustion on
the single-tenant local deployment.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_MAX_CONCURRENT = 2


class PlaywrightFallbackError(RuntimeError):
    """Raised when the Playwright fetch pipeline fails.

    Attributes:
        url: The URL that failed.
        cause: The underlying exception, if any.
    """

    def __init__(self, url: str, cause: BaseException | None = None) -> None:
        self.url = url
        self.cause = cause
        msg = f"Playwright fetch failed for {url!r}"
        if cause is not None:
            msg = f"{msg}: {cause}"
        super().__init__(msg)


class PlaywrightRunner:
    """Async Playwright runner with stealth and bounded concurrency.

    Shared by all unofficial adapters as the Playwright fallback path.
    Each call launches a new browser context (incognito) and closes it
    after the response is received — this avoids cookie leakage between
    adapter calls.

    Args:
        headless: Run Chromium in headless mode (default True).
            Set ``PLAYWRIGHT_HEADLESS=false`` in the environment for
            interactive debugging — or pass ``headless=False`` directly.
        max_concurrent: Maximum simultaneous browser contexts (default 2).

    Note:
        ``playwright install chromium`` must have been run before use.
    """

    def __init__(
        self,
        *,
        headless: bool = True,
        max_concurrent: int = _MAX_CONCURRENT,
    ) -> None:
        self._headless = headless
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_json(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        cookies: dict[str, str] | None = None,
        *,
        headless: bool | None = None,
        timeout_ms: int = 30_000,
    ) -> dict[str, Any]:
        """Fetch a URL with Playwright and parse the response body as JSON.

        Applies ``playwright-stealth`` to reduce bot-detection fingerprinting.
        Bounded by the instance-level ``asyncio.Semaphore`` so at most
        ``max_concurrent`` contexts run simultaneously.

        Args:
            url: Full URL to fetch.
            headers: Optional HTTP headers to inject before navigation.
            cookies: Optional cookies to set on the browser context before
                navigation.  Keys are cookie names; values are cookie values.
                The domain is inferred from ``url``.
            headless: Override instance-level headless setting for this call.
            timeout_ms: Navigation timeout in milliseconds (default 30 000).

        Returns:
            Parsed JSON dict from the page's response body.

        Raises:
            PlaywrightFallbackError: On any Playwright or JSON parse error.
        """
        # Import here to keep module importable even when playwright is not
        # installed.  Callers that land here must have playwright installed.
        try:
            from playwright.async_api import (  # type: ignore[import-untyped]
                async_playwright,
            )
            from playwright_stealth import stealth_async  # type: ignore[import-untyped]
        except ImportError as exc:
            raise PlaywrightFallbackError(
                url,
                ImportError(
                    "playwright and playwright-stealth must be installed. "
                    "Run: uv add playwright playwright-stealth && playwright install chromium"
                ),
            ) from exc

        effective_headless = headless if headless is not None else self._headless

        async with self._semaphore:
            try:
                async with async_playwright() as pw:
                    browser = await pw.chromium.launch(headless=effective_headless)
                    context = await browser.new_context()

                    if cookies:
                        from urllib.parse import urlparse

                        parsed = urlparse(url)
                        domain = parsed.hostname or ""
                        await context.add_cookies(
                            [
                                {
                                    "name": name,
                                    "value": value,
                                    "domain": domain,
                                    "path": "/",
                                }
                                for name, value in cookies.items()
                            ]
                        )

                    page = await context.new_page()
                    await stealth_async(page)

                    if headers:
                        await page.set_extra_http_headers(headers)

                    response = await page.goto(url, timeout=timeout_ms)

                    if response is None:
                        raise PlaywrightFallbackError(url, RuntimeError("No response"))

                    body = await response.body()
                    await browser.close()

                    try:
                        return json.loads(body)  # type: ignore[no-any-return]
                    except json.JSONDecodeError as exc:
                        raise PlaywrightFallbackError(
                            url,
                            ValueError(f"Response body is not valid JSON: {exc}"),
                        ) from exc

            except PlaywrightFallbackError:
                raise
            except Exception as exc:
                logger.exception("Playwright fetch error for %s", url)
                raise PlaywrightFallbackError(url, exc) from exc
