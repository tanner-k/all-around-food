"""Tests for the recipe-parse judge (Anthropic client mocked)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from allaroundfood.models import Recipe
from allaroundfood.parsing.judge import (
    JUDGE_MODEL,
    GradeResult,
    RecipeImageSource,
    RecipeUrlTextSource,
    grade_recipe_parse,
)

from .conftest import valid_recipe_input, valid_verdict_input


def _recipe() -> Recipe:
    return Recipe.model_validate(valid_recipe_input())


class TestGradeRecipeParse:
    def test_returns_verdict(self, make_client: Any) -> None:
        make_client(valid_verdict_input())
        result = grade_recipe_parse(
            source_kind="url",
            source_ref="https://example.com/r",
            worker_prompt="SYSTEM: ...",
            worker_output=_recipe(),
        )
        assert isinstance(result, GradeResult)
        assert result.verdict["overall_grade"] == 8
        assert result.verdict["field_checks"][0]["issue"] == "missing"
        # raw_judge_output is JSON-encoded tool input.
        assert json.loads(result.raw_judge_output)["accuracy_grade"] == 9

    def test_forces_submit_verdict_tool_and_model(self, make_client: Any) -> None:
        messages = make_client(valid_verdict_input())
        grade_recipe_parse(
            source_kind="image",
            source_ref="screenshot:abc",
            worker_prompt="p",
            worker_output=_recipe(),
        )
        call = messages.calls[0]
        assert call["model"] == JUDGE_MODEL
        assert call["tool_choice"] == {"type": "tool", "name": "submit_verdict"}
        assert call["tools"][0]["name"] == "submit_verdict"

    def test_system_prompt_embeds_recipe_schema(self, make_client: Any) -> None:
        messages = make_client(valid_verdict_input())
        grade_recipe_parse(
            source_kind="url",
            source_ref="r",
            worker_prompt="p",
            worker_output=_recipe(),
        )
        system_text = messages.calls[0]["system"][0]["text"]
        assert system_text.startswith(
            "You are an expert culinary editor evaluating"
        )
        # The embedded recipe JSON schema (built from pydantic).
        assert '"parse_confidence"' in system_text
        assert "Return ONLY the tool call — no prose." in system_text

    def test_url_text_source_appended(self, make_client: Any) -> None:
        messages = make_client(valid_verdict_input())
        grade_recipe_parse(
            source_kind="url",
            source_ref="r",
            worker_prompt="p",
            worker_output=_recipe(),
            source_content=RecipeUrlTextSource(text="raw page text"),
        )
        content = messages.calls[0]["messages"][0]["content"]
        assert content[0]["type"] == "text"
        assert content[0]["text"].startswith("SOURCE_KIND: url")
        assert content[1] == {"type": "text", "text": "SOURCE_TEXT:\nraw page text"}

    def test_image_source_appended(self, make_client: Any) -> None:
        messages = make_client(valid_verdict_input())
        grade_recipe_parse(
            source_kind="image",
            source_ref="screenshot:abc",
            worker_prompt="p",
            worker_output=_recipe(),
            source_content=RecipeImageSource(base64="QUJD", media_type="image/png"),
        )
        content = messages.calls[0]["messages"][0]["content"]
        image_block = content[1]
        assert image_block["type"] == "image"
        assert image_block["source"] == {
            "type": "base64",
            "media_type": "image/png",
            "data": "QUJD",
        }

    def test_no_source_content_only_text_block(self, make_client: Any) -> None:
        messages = make_client(valid_verdict_input())
        grade_recipe_parse(
            source_kind="url",
            source_ref="r",
            worker_prompt="p",
            worker_output=_recipe(),
        )
        content = messages.calls[0]["messages"][0]["content"]
        assert len(content) == 1
        assert content[0]["type"] == "text"

    def test_missing_tool_use_raises(self, make_client: Any) -> None:
        make_client(valid_verdict_input(), include_tool_use=False)
        with pytest.raises(RuntimeError, match="No tool_use block"):
            grade_recipe_parse(
                source_kind="url",
                source_ref="r",
                worker_prompt="p",
                worker_output=_recipe(),
            )
