"""Tests for worker-side URL normalization (ADR 0008: cache key derivation)."""

from __future__ import annotations

import pytest

from allaroundfood.url_normalize import SHORTLINK_HOSTS, normalize_url


def test_strips_tracking_params_and_fragment() -> None:
    url = "https://Example.com/Recipe/?utm_source=x&utm_medium=y&fbclid=abc&id=7#steps"
    assert normalize_url(url) == "https://example.com/Recipe?id=7"


def test_lowercases_scheme_and_host_only() -> None:
    assert normalize_url("HTTPS://WWW.Foo.COM/Cake") == "https://www.foo.com/Cake"


def test_strips_trailing_slash_except_root() -> None:
    assert normalize_url("https://foo.com/cake/") == "https://foo.com/cake"
    assert normalize_url("https://foo.com/") == "https://foo.com/"


def test_instagram_tiktok_junk_params_removed() -> None:
    url = "https://www.instagram.com/reel/ABC123/?igsh=xyz&igshid=123&si=zz"
    assert normalize_url(url) == "https://www.instagram.com/reel/ABC123"


def test_shortlink_host_is_resolved_then_normalized() -> None:
    def fake_resolve(url: str) -> str:
        assert url == "https://vm.tiktok.com/ZMabc/"
        return "https://www.tiktok.com/@cook/video/123?_t=8&_r=1"

    result = normalize_url("https://vm.tiktok.com/ZMabc/", resolve=fake_resolve)
    assert result == "https://www.tiktok.com/@cook/video/123"


def test_non_shortlink_host_never_calls_resolver() -> None:
    def boom(url: str) -> str:
        raise AssertionError("resolver must not be called")

    assert normalize_url("https://foo.com/x", resolve=boom) == "https://foo.com/x"


def test_query_param_order_does_not_change_key() -> None:
    assert normalize_url("https://foo.com/x?a=1&b=2") == normalize_url(
        "https://foo.com/x?b=2&a=1"
    )


def test_rejects_non_http_url() -> None:
    with pytest.raises(ValueError):
        normalize_url("ftp://foo.com/x")


def test_known_shortlink_hosts() -> None:
    assert "vm.tiktok.com" in SHORTLINK_HOSTS
    assert "vt.tiktok.com" in SHORTLINK_HOSTS
