"""URL normalization for the parse-results cache key (ADR 0008).

Normalization happens in the worker, never on the phone: strip tracking
params and fragments, lowercase scheme/host, drop a trailing slash, and
resolve known share-shortlink hosts by following redirects.
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Hosts whose URLs are opaque share-shortlinks; resolved via redirects first.
SHORTLINK_HOSTS = frozenset(
    {"vm.tiktok.com", "vt.tiktok.com", "instagr.am", "pin.it", "bit.ly", "tinyurl.com"}
)

# Query params that never identify content (exact names + utm_* prefix).
_TRACKING_PARAMS = frozenset(
    {"fbclid", "gclid", "igsh", "igshid", "si", "feature", "share_id", "_t", "_r", "mibextid"}
)


def _default_resolve(url: str) -> str:
    """Follow redirects for a shortlink and return the final URL.

    Uses a streamed GET (some shortlink hosts reject HEAD) and closes the
    body without reading it.
    """
    import httpx

    try:
        with httpx.Client(follow_redirects=True, timeout=10.0) as client, client.stream(
            "GET", url
        ) as response:
            return str(response.url)
    except httpx.HTTPError as exc:
        raise ValueError(f"could not resolve shortlink {url!r}: {exc}") from exc


def _is_tracking(param: str) -> bool:
    return param in _TRACKING_PARAMS or param.startswith("utm_")


def normalize_url(url: str, *, resolve: Callable[[str], str] | None = None) -> str:
    """Return the canonical cache key for a source URL.

    Args:
        url: The raw URL as shared/submitted.
        resolve: Redirect resolver for shortlink hosts (injectable for tests).

    Raises:
        ValueError: If the URL is not http(s) or has no host.
    """
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError(f"not an http(s) URL: {url!r}")

    if parts.netloc.lower() in SHORTLINK_HOSTS:
        resolver = resolve or _default_resolve
        parts = urlsplit(resolver(url.strip()))

    query = urlencode(
        sorted(
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if not _is_tracking(k)
        )
    )
    path = parts.path if parts.path in ("", "/") else parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, query, ""))
