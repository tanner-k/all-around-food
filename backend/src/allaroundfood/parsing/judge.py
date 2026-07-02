"""Port of ``gradeRecipeParse`` from ``frontend/src/lib/claude.ts``.

LLM-as-judge grading of a recipe parse (model ``claude-sonnet-4-6``, forced
``submit_verdict`` tool). The judge system prompt is ported verbatim; it embeds
the recipe JSON schema (built here from ``Recipe.model_json_schema()`` rather
than a hand-written schema). Supports both ``url-text`` and ``image`` source
content.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from allaroundfood.models import Recipe
from allaroundfood.parsing.recipe_parser import get_client

if TYPE_CHECKING:
    from anthropic.types import (
        Message,
        MessageParam,
        TextBlockParam,
        ToolChoiceToolParam,
        ToolParam,
        ToolUseBlock,
    )

# ── Model / request constants (mirror claude.ts) ─────────────────────────────
JUDGE_MODEL = "claude-sonnet-4-6"
JUDGE_MAX_TOKENS = 4096

# ── Judge verdict tool schema (mirror eval-schema.ts JudgeVerdictSchema) ─────
# Inline JSON schema (no $ref / $schema wrapper) — Anthropic tool input_schema
# requires this shape, matching the zod-to-json-schema output in eval-schema.ts.
_JUDGE_FIELD_CHECK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "field": {"type": "string"},
        "issue": {
            "type": "string",
            "enum": ["missing", "incorrect", "hallucinated", "fine"],
        },
        "detail": {"type": "string"},
    },
    "required": ["field", "issue", "detail"],
    "additionalProperties": False,
}

JUDGE_VERDICT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "overall_grade": {"type": "integer", "minimum": 0, "maximum": 10},
        "accuracy_grade": {"type": "integer", "minimum": 0, "maximum": 10},
        "completeness_grade": {"type": "integer", "minimum": 0, "maximum": 10},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
        "field_checks": {
            "type": "array",
            "items": _JUDGE_FIELD_CHECK_SCHEMA,
            "default": [],
        },
        "reasoning": {"type": "string"},
        "suggested_prompt_improvements": {"type": ["string", "null"]},
    },
    "required": [
        "overall_grade",
        "accuracy_grade",
        "completeness_grade",
        "strengths",
        "weaknesses",
        "reasoning",
        "suggested_prompt_improvements",
    ],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class RecipeImageSource:
    """Image source content for the judge (base64 + media type)."""

    base64: str
    media_type: str
    kind: str = "image"


@dataclass(frozen=True)
class RecipeUrlTextSource:
    """URL/text source content for the judge."""

    text: str
    kind: str = "url-text"


@dataclass(frozen=True)
class GradeResult:
    """Structured return value analogous to the TS ``gradeRecipeParse`` return."""

    verdict: dict[str, Any]
    judge_prompt: str
    raw_judge_output: str


def _judge_tool() -> ToolParam:
    tool: dict[str, Any] = {
        "name": "submit_verdict",
        "description": "Submit a graded verdict for the parse quality evaluation",
        "input_schema": JUDGE_VERDICT_JSON_SCHEMA,
    }
    return cast("ToolParam", tool)


def _build_judge_system() -> str:
    """Judge system prompt (VERBATIM from claude.ts), with the recipe JSON schema
    built from pydantic and pretty-printed (2-space indent, like ``JSON.stringify``)."""
    recipe_schema_json = json.dumps(Recipe.model_json_schema(), indent=2)
    return f"""You are an expert culinary editor evaluating an automated recipe-parsing system.

The parser was asked to extract a recipe into this exact structured schema:

{recipe_schema_json}

You will receive (1) the source the parser saw (URL+text or image) and (2) the structured Recipe JSON the parser produced.

Grade three dimensions independently on a 0-10 scale:

  overall_grade       — holistic quality.
  accuracy_grade      — are the populated fields correct? Compare structured value/unit against `as_written` strings; flag hallucinations.
  completeness_grade  — did the parser populate every field the source actually contained? A null is correct only if the source genuinely lacked that info. Penalize missing nutrition, timing, equipment, etc. when the source provided them.

For each issue, add a JudgeFieldCheck with the exact dotted path (e.g. "ingredients[3].quantity.unit" or "nutrition.kcal") and one of: missing | incorrect | hallucinated | fine.

If you spot a recurring pattern (parser consistently drops X-type info), populate suggested_prompt_improvements with one concrete sentence to add to the parser prompt.

Return ONLY the tool call — no prose."""  # noqa: E501


def grade_recipe_parse(
    source_kind: str,
    source_ref: str,
    worker_prompt: str,
    worker_output: Recipe,
    source_content: RecipeImageSource | RecipeUrlTextSource | None = None,
) -> GradeResult:
    """Grade a recipe parse with Sonnet + forced ``submit_verdict`` tool.

    ``source_kind`` is ``"image"`` or ``"url"``. ``source_content`` optionally
    provides the raw source (image base64 or url text) for the judge to compare
    against.
    """
    client = get_client()

    worker_output_json = json.dumps(worker_output.model_dump(mode="json"), indent=2)
    judge_system = _build_judge_system()

    user_text_block = (
        f"SOURCE_KIND: {source_kind}\n"
        f"SOURCE_REF: {source_ref}\n"
        f"WORKER_OUTPUT:\n{worker_output_json}"
    )

    user_content: list[dict[str, Any]] = [{"type": "text", "text": user_text_block}]

    if source_content is not None:
        if source_content.kind == "image":
            assert isinstance(source_content, RecipeImageSource)
            user_content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": source_content.media_type,
                        "data": source_content.base64,
                    },
                }
            )
        else:
            assert isinstance(source_content, RecipeUrlTextSource)
            user_content.append(
                {"type": "text", "text": f"SOURCE_TEXT:\n{source_content.text}"}
            )

    system: list[TextBlockParam] = [
        {"type": "text", "text": judge_system, "cache_control": {"type": "ephemeral"}}
    ]
    tool_choice: ToolChoiceToolParam = {"type": "tool", "name": "submit_verdict"}
    messages: list[MessageParam] = [
        {"role": "user", "content": cast("Any", user_content)}
    ]
    response = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=JUDGE_MAX_TOKENS,
        system=system,
        tools=[_judge_tool()],
        tool_choice=tool_choice,
        messages=messages,
    )

    tool_input = _extract_tool_use_input(response, "judge response")
    verdict: dict[str, Any] = dict(tool_input)

    judge_prompt = "\n\n".join(["SYSTEM:\n" + judge_system, "USER:\n" + user_text_block])
    raw_judge_output = json.dumps(tool_input)

    return GradeResult(
        verdict=verdict, judge_prompt=judge_prompt, raw_judge_output=raw_judge_output
    )


def _extract_tool_use_input(response: Message, context: str) -> Any:
    """Return the ``input`` of the first ``tool_use`` block, or raise.

    Duck-typed on the ``type`` discriminator (like ``claude.ts``) so test doubles
    that mimic a tool_use block work; ``cast`` gives mypy the typed ``.input``.
    """
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return cast("ToolUseBlock", block).input
    raise RuntimeError(f"No tool_use block in {context}")
