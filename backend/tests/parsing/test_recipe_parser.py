"""Tests for the recipe parsers (Anthropic client mocked)."""

from __future__ import annotations

from typing import Any

import pytest

from allaroundfood.models import Recipe
from allaroundfood.parsing import recipe_parser
from allaroundfood.parsing.recipe_parser import (
    STRIPPED_TEXT_CAP,
    WORKER_MODEL,
    parse_recipe_from_image,
    parse_recipe_from_text,
    parse_recipe_from_url,
    parse_recipe_from_video_text,
)

from .conftest import valid_recipe_input


class TestParseRecipeFromImage:
    def test_returns_valid_recipe(self, make_client: Any) -> None:
        make_client(valid_recipe_input())
        result = parse_recipe_from_image(b"\x89PNG-bytes", "image/png")

        assert isinstance(result.recipe, Recipe)
        assert result.recipe.title == "Test Pancakes"
        assert result.stripped_text is None

    def test_forces_extract_recipe_tool_and_model(self, make_client: Any) -> None:
        messages = make_client(valid_recipe_input())
        parse_recipe_from_image(b"bytes", "image/jpeg")

        call = messages.calls[0]
        assert call["model"] == WORKER_MODEL
        assert call["tool_choice"] == {"type": "tool", "name": "extract_recipe"}
        assert call["tools"][0]["name"] == "extract_recipe"
        # Schema is built from pydantic, not hand-written.
        assert "properties" in call["tools"][0]["input_schema"]
        # The model may report insufficient evidence with empty arrays; the
        # shared Recipe validator rejects those outputs after the tool call.
        assert "minItems" not in call["tools"][0]["input_schema"]["properties"]["ingredients"]
        assert "minItems" not in call["tools"][0]["input_schema"]["properties"]["steps"]

    def test_image_block_is_base64_encoded(self, make_client: Any) -> None:
        messages = make_client(valid_recipe_input())
        parse_recipe_from_image(b"rawbytes", "image/webp")

        content = messages.calls[0]["messages"][0]["content"]
        image_block = content[0]
        assert image_block["type"] == "image"
        assert image_block["source"]["media_type"] == "image/webp"
        # base64 of b"rawbytes"
        import base64

        assert image_block["source"]["data"] == base64.standard_b64encode(b"rawbytes").decode(
            "ascii"
        )

    def test_worker_prompt_mentions_image(self, make_client: Any) -> None:
        make_client(valid_recipe_input())
        result = parse_recipe_from_image(b"x", "image/png")
        assert "USER: [image] Extract the recipe from this image." in result.worker_prompt
        assert result.worker_prompt.startswith("SYSTEM:\n")

    def test_missing_tool_use_raises(self, make_client: Any) -> None:
        make_client(valid_recipe_input(), include_tool_use=False)
        with pytest.raises(RuntimeError, match="No tool_use block"):
            parse_recipe_from_image(b"x", "image/png")


class TestParseRecipeFromUrl:
    def _patch_fetch(self, monkeypatch: pytest.MonkeyPatch, html: str) -> None:
        monkeypatch.setattr(recipe_parser, "_fetch_public_html", lambda url: html)

    def test_html_strip_and_cap(self, make_client: Any, monkeypatch: pytest.MonkeyPatch) -> None:
        # Build HTML whose visible text far exceeds the 30k cap.
        filler = "word " * 20_000  # ~100k chars of visible text
        html = (
            "<html><head><script>var x=1;</script>"
            "<style>.a{color:red}</style></head>"
            f"<body><h1>Recipe</h1><p>{filler}</p></body></html>"
        )
        self._patch_fetch(monkeypatch, html)
        make_client(valid_recipe_input())

        result = parse_recipe_from_url("https://example.com/recipe")

        assert result.stripped_text is not None
        assert len(result.stripped_text) == STRIPPED_TEXT_CAP
        # Script/style contents stripped out.
        assert "var x=1" not in result.stripped_text
        assert "color:red" not in result.stripped_text
        # Tags collapsed, visible text kept.
        assert result.stripped_text.startswith("Recipe word")

    def test_user_message_is_stripped_text(
        self, make_client: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_fetch(monkeypatch, "<html><body><p>Hello  world</p></body></html>")
        messages = make_client(valid_recipe_input())

        result = parse_recipe_from_url("https://foo.test/r")

        call = messages.calls[0]
        assert call["messages"][0]["content"] == result.stripped_text
        assert result.stripped_text == "Hello world"

    def test_url_prompt_variant(self, make_client: Any, monkeypatch: pytest.MonkeyPatch) -> None:
        self._patch_fetch(monkeypatch, "<body>text</body>")
        messages = make_client(valid_recipe_input())

        parse_recipe_from_url("https://cooking.example/r")

        system_text = messages.calls[0]["system"][0]["text"]
        assert "The text was extracted from a webpage." in system_text
        assert "Source URL: https://cooking.example/r" in system_text
        # The image-specific rule 2 was replaced.
        assert "Scan the entire image." not in system_text


class TestParseRecipeFromVideoText:
    def test_video_prompt_variant_and_assembly(self, make_client: Any) -> None:
        messages = make_client(valid_recipe_input())

        result = parse_recipe_from_video_text(
            caption="Best tacos", transcript="add beef", source_url="https://tiktok.com/x"
        )

        system_text = messages.calls[0]["system"][0]["text"]
        assert "short-form recipe video" in system_text
        assert "Source URL: https://tiktok.com/x" in system_text
        assert "Scan the entire image." not in system_text

        assert result.stripped_text is not None
        assert "CAPTION:\nBest tacos" in result.stripped_text
        assert "TRANSCRIPT:\nadd beef" in result.stripped_text

    def test_empty_caption_and_transcript_raises(self, make_client: Any) -> None:
        make_client(valid_recipe_input())
        with pytest.raises(RuntimeError, match="No video transcript or caption"):
            parse_recipe_from_video_text(caption="  ", transcript="", source_url="u")

    def test_none_placeholders(self, make_client: Any) -> None:
        make_client(valid_recipe_input())
        result = parse_recipe_from_video_text(caption="only caption", transcript="", source_url="u")
        assert result.stripped_text is not None
        assert "TRANSCRIPT:\n(none)" in result.stripped_text


class TestGetClient:
    def test_raises_when_key_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(recipe_parser, "_client", None)
        monkeypatch.setattr(
            recipe_parser.settings, "anthropic_api_key_parsing", None, raising=False
        )
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY_PARSING is not set"):
            recipe_parser.get_client()
        monkeypatch.setattr(recipe_parser, "_client", None)


def test_pasted_text_uses_no_invention_prompt(make_client: Any) -> None:
    messages = make_client(valid_recipe_input())
    parse_recipe_from_text("1 cup rice. Boil rice.")
    assert "do not invent" in messages.calls[0]["system"][0]["text"].lower()


def test_private_url_rejected_before_client_or_claude(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recipe_parser, "get_client", lambda: pytest.fail("Claude called"))
    with pytest.raises(ValueError, match="public"):
        parse_recipe_from_url("http://127.0.0.1/recipe")


def test_jsonld_recipe_is_passed_to_parser(
    make_client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    html = (
        '<script type="application/ld+json">'
        '{"@context":"https://schema.org","@type":"Recipe",'
        '"name":"Bean Stew","recipeIngredient":["beans"],'
        '"recipeInstructions":["Simmer beans"]}'
        "</script><p>Unrelated page</p>"
    )
    monkeypatch.setattr(recipe_parser, "_fetch_public_html", lambda url: html)
    messages = make_client(valid_recipe_input())
    parse_recipe_from_url("https://recipes.example/stew")
    sent = messages.calls[0]["messages"][0]["content"]
    assert "Bean Stew" in sent
    assert "Simmer beans" in sent


def test_dns_private_address_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        recipe_parser.socket,
        "getaddrinfo",
        lambda *args: [(None, None, None, None, ("10.0.0.7", 443))],
    )
    with pytest.raises(ValueError, match="public"):
        recipe_parser._check_public_url("https://recipes.example/private")


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
        lambda url: check("http://127.0.0.1") if "127.0.0.1" in url else "93.184.216.34",
    )
    with pytest.raises(ValueError, match="public"):
        recipe_parser._fetch_public_html("https://recipes.example/start")
    assert fetched[0][0] == "https://93.184.216.34/start"
    assert fetched[0][1]["headers"] == {"Host": "recipes.example"}
    assert fetched[0][1]["extensions"] == {"sni_hostname": "recipes.example"}
    assert len(fetched) == 1
