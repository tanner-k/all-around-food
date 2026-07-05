"""Shared fakes for the parsing tests.

The Anthropic SDK is mocked: ``FakeAnthropic.messages.create`` records the call
kwargs and returns a canned response holding a single ``tool_use`` block. The
parsing modules use a module-level singleton client (``recipe_parser._client``);
``fake_client`` monkeypatches it (and resets afterward) so both
``recipe_parser`` and ``judge`` (which reuses ``get_client``) are covered.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from allaroundfood.parsing import recipe_parser


@dataclass
class FakeToolUseBlock:
    """Mimics an Anthropic ``ToolUseBlock``."""

    input: Any
    type: str = "tool_use"


@dataclass
class FakeTextBlock:
    """Mimics an Anthropic text block (no ``tool_use``)."""

    text: str = ""
    type: str = "text"


@dataclass
class FakeMessage:
    """Mimics an Anthropic ``Message`` with a ``content`` list of blocks."""

    content: list[Any]


@dataclass
class FakeMessages:
    """Records ``create`` kwargs and returns the queued canned response."""

    tool_input: Any
    calls: list[dict[str, Any]] = field(default_factory=list)
    include_tool_use: bool = True

    def create(self, **kwargs: Any) -> FakeMessage:
        self.calls.append(kwargs)
        if not self.include_tool_use:
            return FakeMessage(content=[FakeTextBlock(text="no tool call")])
        return FakeMessage(
            content=[FakeTextBlock(text="reasoning"), FakeToolUseBlock(input=self.tool_input)]
        )


@dataclass
class FakeAnthropic:
    """Mimics the ``Anthropic`` client with a ``.messages`` attribute."""

    messages: FakeMessages


@pytest.fixture
def make_client(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """Return a factory that installs a FakeAnthropic returning ``tool_input``."""

    def _factory(tool_input: Any, *, include_tool_use: bool = True) -> FakeMessages:
        messages = FakeMessages(tool_input=tool_input, include_tool_use=include_tool_use)
        client = FakeAnthropic(messages=messages)
        monkeypatch.setattr(recipe_parser, "_client", client)
        return messages

    yield _factory
    # Reset the singleton so real construction isn't attempted in later tests.
    monkeypatch.setattr(recipe_parser, "_client", None)


def valid_recipe_input() -> dict[str, Any]:
    """A minimal-but-valid ``extract_recipe`` tool output."""
    return {
        "id": "",
        "title": "Test Pancakes",
        "description": None,
        "source_url": None,
        "source_attribution": None,
        "prep_time_min": 5,
        "cook_time_min": 10,
        "total_time_min": 15,
        "servings": 2,
        "yield_text": None,
        "ingredients": [
            {
                "name": "flour",
                "quantity": {"value": 1.0, "unit": "cup", "as_written": "1 cup"},
                "preparation": None,
                "optional": False,
                "group": None,
                "notes": None,
            }
        ],
        "steps": [
            {
                "order": 1,
                "instruction": "Mix and cook.",
                "duration_min": None,
                "temperature_f": None,
                "equipment": [],
                "inline_amounts": ["flour"],
            }
        ],
        "equipment": [],
        "cuisine": None,
        "course": None,
        "dietary_tags": [],
        "difficulty": "easy",
        "nutrition": None,
        "notes": None,
        "storage_instructions": None,
        "created_at": "2026-07-02T12:00:00Z",
        "times_made": 0,
        "parse_confidence": 0.9,
    }


def valid_verdict_input() -> dict[str, Any]:
    """A minimal-but-valid ``submit_verdict`` tool output."""
    return {
        "overall_grade": 8,
        "accuracy_grade": 9,
        "completeness_grade": 7,
        "strengths": ["clear structure"],
        "weaknesses": ["missing nutrition"],
        "field_checks": [
            {"field": "nutrition.kcal", "issue": "missing", "detail": "no kcal"}
        ],
        "reasoning": "Good overall.",
        "suggested_prompt_improvements": None,
    }
