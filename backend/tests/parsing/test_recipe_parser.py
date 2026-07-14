"""Tests for the recipe parsers (Anthropic client mocked)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from allaroundfood.models import Recipe
from allaroundfood.parsing import recipe_parser
from allaroundfood.parsing.recipe_parser import (
    STRIPPED_TEXT_CAP,
    WORKER_MODEL,
    parse_recipe_from_image,
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

    def test_image_block_is_base64_encoded(self, make_client: Any) -> None:
        messages = make_client(valid_recipe_input())
        parse_recipe_from_image(b"rawbytes", "image/webp")

        content = messages.calls[0]["messages"][0]["content"]
        image_block = content[0]
        assert image_block["type"] == "image"
        assert image_block["source"]["media_type"] == "image/webp"
        # base64 of b"rawbytes"
        import base64

        assert image_block["source"]["data"] == base64.standard_b64encode(
            b"rawbytes"
        ).decode("ascii")

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
        class _FakeResponse:
            text = html

        class _FakeClient:
            def __init__(self, *a: Any, **k: Any) -> None:
                pass

            def __enter__(self) -> _FakeClient:
                return self

            def __exit__(self, *a: Any) -> None:
                return None

            def get(self, url: str) -> _FakeResponse:
                return _FakeResponse()

        monkeypatch.setattr(httpx, "Client", _FakeClient)

    def test_html_strip_and_cap(
        self, make_client: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
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
        self._patch_fetch(
            monkeypatch, "<html><body><p>Hello  world</p></body></html>"
        )
        messages = make_client(valid_recipe_input())

        result = parse_recipe_from_url("https://foo.test/r")

        call = messages.calls[0]
        assert call["messages"][0]["content"] == result.stripped_text
        assert result.stripped_text == "Hello world"

    def test_url_prompt_variant(
        self, make_client: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
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
        result = parse_recipe_from_video_text(
            caption="only caption", transcript="", source_url="u"
        )
        assert result.stripped_text is not None
        assert "TRANSCRIPT:\n(none)" in result.stripped_text


class TestGetClient:
    def test_raises_when_key_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from allaroundfood.config import settings

        monkeypatch.setattr(recipe_parser, "_client", None)
        monkeypatch.setattr(settings, "anthropic_api_key_parsing", None, raising=False)
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY_PARSING is not set"):
            recipe_parser.get_client()
        monkeypatch.setattr(recipe_parser, "_client", None)
