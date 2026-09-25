"""Jev recipe entry points and URL safety."""

from __future__ import annotations

from typing import Any

import pytest

from allaroundfood.parsing import recipe_parser
from allaroundfood.parsing.recipe_parser import (
    parse_recipe_from_image,
    parse_recipe_from_text,
    parse_recipe_from_url,
    parse_recipe_from_video_text,
)

from .conftest import valid_recipe_input


def _fake_parse(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def parse(sources: dict[str, str], **kwargs: Any) -> Any:
        from types import SimpleNamespace

        from allaroundfood.models import Recipe

        calls.append({"sources": sources, **kwargs})
        return SimpleNamespace(
            recipe=Recipe.model_validate(valid_recipe_input()),
            warnings=["partial source"],
            evidence={"count": 1},
        )

    monkeypatch.setattr(recipe_parser, "parse_sources", parse)
    return calls


def test_text_passes_bounded_source_and_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_parse(monkeypatch)
    result = parse_recipe_from_text(" 1 cup rice.\nBoil rice. ")
    assert calls[0]["sources"] == {"text": "1 cup rice.\nBoil rice."}
    assert result.warnings == ["partial source"]
    assert result.evidence == {"count": 1}


def test_text_over_limit_rejected_before_parse(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_parse(monkeypatch)
    with pytest.raises(ValueError, match="shorter excerpt"):
        parse_recipe_from_text("a" * (recipe_parser.STRIPPED_TEXT_CAP + 1))


def test_video_keeps_caption_and_transcript_separate(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_parse(monkeypatch)
    parse_recipe_from_video_text("Best tacos", "add beef", "https://tiktok.com/x")
    assert calls[0]["sources"] == {"caption": "Best tacos", "transcript": "add beef"}
    assert calls[0]["source_url"] == "https://tiktok.com/x"


def test_video_combined_source_limit_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_parse(monkeypatch)
    with pytest.raises(ValueError, match="shorter excerpt"):
        parse_recipe_from_video_text("a" * 20000, "b" * 10001, "https://tiktok.com/x")


def test_jsonld_preferred_with_step_sections(monkeypatch: pytest.MonkeyPatch) -> None:
    html = (
        '<script type="application/ld+json">'
        '{"@type":"Recipe","name":"Bean Stew","recipeIngredient":["1 cup beans","2 cups water"],'
        '"recipeInstructions":[{"@type":"HowToSection","name":"Cook",'
        '"itemListElement":[{"@type":"HowToStep","text":"Simmer beans"}]}]}'
        "</script><p>Unrelated page noise</p>"
    )
    monkeypatch.setattr(recipe_parser, "_fetch_public_html", lambda url: html)
    calls = _fake_parse(monkeypatch)
    parse_recipe_from_url("https://recipes.example/stew")
    sent = calls[0]["sources"]["webpage"]
    assert calls[0]["title"] == "Bean Stew"
    assert "1 cup beans\n2 cups water" in sent
    assert "Cook\nSimmer beans" in sent
    assert "Unrelated page" not in sent


def test_html_blocks_remain_separate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        recipe_parser,
        "_fetch_public_html",
        lambda url: "<h1>Soup</h1><p>Peas</p><li>Boil peas</li>",
    )
    calls = _fake_parse(monkeypatch)
    parse_recipe_from_url("https://recipes.example/soup")
    assert calls[0]["sources"]["webpage"] == "Soup\nPeas\nBoil peas"


@pytest.mark.parametrize(
    "html",
    [
        "<p>" + "a" * (recipe_parser.STRIPPED_TEXT_CAP + 1) + "</p>",
        '<script type="application/ld+json">'
        + '{"@type":"Recipe","name":"Soup","recipeIngredient":["'
        + "a" * recipe_parser.STRIPPED_TEXT_CAP
        + '"]}</script>',
    ],
    ids=["html", "jsonld"],
)
def test_website_over_limit_rejected(monkeypatch: pytest.MonkeyPatch, html: str) -> None:
    monkeypatch.setattr(recipe_parser, "_fetch_public_html", lambda url: html)
    _fake_parse(monkeypatch)
    with pytest.raises(ValueError, match="shorter excerpt"):
        parse_recipe_from_url("https://recipes.example/long")


def test_private_url_rejected_before_jev(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recipe_parser, "parse_sources", lambda *a, **k: pytest.fail("parsed"))
    with pytest.raises(ValueError, match="public"):
        parse_recipe_from_url("http://127.0.0.1/recipe")


def test_image_ocr_uses_bounded_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _fake_parse(monkeypatch)
    monkeypatch.setattr(
        recipe_parser, "settings", type("OCRSettings", (), {"tesseract_bin": "tesseract"})()
    )
    invoked: list[dict[str, Any]] = []

    def run(args: Any, **kwargs: Any) -> Any:
        from types import SimpleNamespace

        invoked.append({"args": args, **kwargs})
        return SimpleNamespace(returncode=0, stdout="1 cup rice\nBoil rice", stderr="")

    monkeypatch.setattr(recipe_parser.subprocess, "run", run)
    parse_recipe_from_image(b"image", "image/png")
    assert calls[0]["sources"] == {"ocr": "1 cup rice\nBoil rice"}
    assert invoked[0]["timeout"] <= 15


def test_image_rejects_unsupported_or_oversized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recipe_parser.subprocess, "run", lambda *a, **k: pytest.fail("OCR called"))
    with pytest.raises(ValueError, match="PNG, JPEG, or WebP"):
        parse_recipe_from_image(b"x", "image/gif")
    with pytest.raises(ValueError, match="too large"):
        parse_recipe_from_image(b"x" * (recipe_parser.IMAGE_BYTES_CAP + 1), "image/png")


def test_missing_ocr_advises_paste_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        recipe_parser, "settings", type("OCRSettings", (), {"tesseract_bin": "tesseract"})()
    )

    def missing(*args: Any, **kwargs: Any) -> Any:
        raise FileNotFoundError

    monkeypatch.setattr(recipe_parser.subprocess, "run", missing)
    with pytest.raises(RuntimeError, match="paste.*text"):
        parse_recipe_from_image(b"image", "image/png")


def test_ocr_over_limit_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    monkeypatch.setattr(
        recipe_parser.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="a" * (recipe_parser.STRIPPED_TEXT_CAP + 1),
        ),
    )
    monkeypatch.setattr(
        recipe_parser, "settings", type("OCRSettings", (), {"tesseract_bin": "tesseract"})()
    )
    _fake_parse(monkeypatch)
    with pytest.raises(ValueError, match="shorter excerpt"):
        parse_recipe_from_image(b"image", "image/png")


def test_dns_private_address_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        recipe_parser.socket,
        "getaddrinfo",
        lambda *args: [(None, None, None, None, ("10.0.0.7", 443))],
    )
    with pytest.raises(ValueError, match="public"):
        recipe_parser._check_public_url("https://recipes.example/private")


def test_stalled_dns_respects_total_fetch_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    import threading
    import time

    release = threading.Event()
    monkeypatch.setattr(recipe_parser, "FETCH_TIMEOUT_S", 0.05)

    def stalled_dns(*args: Any) -> list[tuple[Any, ...]]:
        release.wait(1)
        return [(None, None, None, None, ("93.184.216.34", 443))]

    monkeypatch.setattr(recipe_parser.socket, "getaddrinfo", stalled_dns)

    class Client:
        def __init__(self, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> Client:
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def stream(self, *args: Any, **kwargs: Any) -> None:
            pytest.fail("fetch after stalled DNS")

    monkeypatch.setattr(recipe_parser.httpx, "Client", Client)
    start = time.monotonic()
    try:
        with pytest.raises(ValueError, match="too long"):
            recipe_parser._fetch_public_html("https://recipes.example/start")
        assert time.monotonic() - start < 0.3
    finally:
        release.set()


def test_stalled_dns_lookups_do_not_spawn_unbounded_threads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import threading

    release = threading.Event()
    started = 0

    def stalled_dns(*args: Any) -> list[tuple[Any, ...]]:
        nonlocal started
        started += 1
        release.wait(1)
        return [(None, None, None, None, ("93.184.216.34", 443))]

    monkeypatch.setattr(recipe_parser.socket, "getaddrinfo", stalled_dns)
    monkeypatch.setattr(recipe_parser, "FETCH_TIMEOUT_S", 0.01)
    monkeypatch.setattr(recipe_parser, "_DNS_SLOTS", threading.BoundedSemaphore(4))
    try:
        for _ in range(5):
            with pytest.raises(ValueError, match="too long"):
                recipe_parser._check_public_url("https://recipes.example")
        assert started <= 4
    finally:
        release.set()


def test_redirect_to_loopback_is_blocked_before_second_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fetched: list[tuple[str, dict[str, Any]]] = []

    class Response:
        status_code = 302
        headers = {"location": "http://127.0.0.1/private"}

        def __enter__(self) -> Response:
            return self

        def __exit__(self, *args: Any) -> None:
            return None

    class Client:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> Client:
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def stream(self, method: str, url: str, **kwargs: Any) -> Response:
            fetched.append((url, kwargs))
            return Response()

    monkeypatch.setattr(recipe_parser.httpx, "Client", Client)
    check = recipe_parser._check_public_url
    monkeypatch.setattr(
        recipe_parser,
        "_check_public_url",
        lambda url, deadline: check("http://127.0.0.1") if "127.0.0.1" in url else "93.184.216.34",
    )
    with pytest.raises(ValueError, match="public"):
        recipe_parser._fetch_public_html("https://recipes.example/start")
    assert fetched[0][0] == "https://93.184.216.34/start"
    assert fetched[0][1]["headers"] == {"Host": "recipes.example"}
    assert fetched[0][1]["extensions"] == {"sni_hostname": "recipes.example"}
    assert len(fetched) == 1
