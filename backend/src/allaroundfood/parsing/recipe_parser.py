"""Worker-side Claude recipe parsers.

The worker is the single Claude-parsing process. These functions define the
system prompts, model IDs (``claude-haiku-4-5``), ``max_tokens``, forced
``tool_choice`` on the ``extract_recipe`` tool, and the URL/VIDEO prompt
variants.

The Anthropic tool ``input_schema`` is built from ``Recipe.model_json_schema()``
(not hand-written), and tool output is validated back into ``models.Recipe``.
"""

from __future__ import annotations

import base64 as _base64
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

import httpx

from allaroundfood.config import settings
from allaroundfood.models import Recipe

if TYPE_CHECKING:
    from anthropic import Anthropic
    from anthropic.types import (
        Message,
        MessageParam,
        TextBlockParam,
        ToolChoiceToolParam,
        ToolParam,
        ToolUseBlock,
    )

# ── Model / request constants (mirror claude.ts) ─────────────────────────────
WORKER_MODEL = "claude-haiku-4-5"
WORKER_MAX_TOKENS = 4096
FETCH_TIMEOUT_S = 10.0
STRIPPED_TEXT_CAP = 30_000

# ── Shared system prompt for the worker (VERBATIM from claude.ts) ────────────
WORKER_SYSTEM_BASE = """You are an expert recipe parser. Extract the recipe shown in this image into the exact structured schema provided by the `extract_recipe` tool.

CRITICAL RULES:
1. NEVER omit a key. Use `null` for unknown scalars and `[]` for unknown lists. Every key in the schema must appear in your output.
2. The image may contain a title, ingredients, instructions, nutrition info, and notes spread anywhere — TOP to BOTTOM. Scan the entire image.
3. For each Quantity, ALWAYS populate `as_written` with the raw substring you saw (e.g. "1½ cups"), even if you also produce structured `value`/`unit`.
4. For each Step, populate `inline_amounts` with the names of ingredients referenced — this drives the inline-amount display.
5. Convert temperatures to Fahrenheit (temperature_f). If only Celsius given, convert.
6. `id` should be left as empty string "" — the application will assign a UUID at save time. `created_at` should be the current ISO datetime.
7. Self-rate your parse on a 0.0–1.0 scale in `parse_confidence`. Be honest: if the image is blurry or partial, rate lower."""  # noqa: E501

WORKER_SYSTEM_URL_EXTRA = """
2. The text was extracted from a webpage. Look for ingredient lists, step lists, nutrition tables."""  # noqa: E501

WORKER_SYSTEM_VIDEO_EXTRA = """
2. The text was extracted from a short-form recipe video. It may include captions, transcript snippets, creator descriptions, OCR text, hashtags, or comments. Reconstruct the recipe only from the provided text; do not invent missing ingredients or steps."""  # noqa: E501

# The exact substring the URL/VIDEO variants replace in WORKER_SYSTEM_BASE.
_RULE_TWO_IMAGE = (
    "2. The image may contain a title, ingredients, instructions, nutrition info, "
    "and notes spread anywhere — TOP to BOTTOM. Scan the entire image."
)


@dataclass(frozen=True)
class RecipeParseResult:
    """Structured return value analogous to the TS parser return objects.

    ``worker_prompt`` is the flattened SYSTEM/USER string later persisted on
    ``evaluations`` rows (kept byte-for-byte analogous to ``claude.ts``).
    ``stripped_text`` is populated for the URL and video parsers (the text sent
    as the user message); it is ``None`` for the image parser.
    """

    recipe: Recipe
    worker_prompt: str
    stripped_text: str | None = None


# ── Lazy singleton client (mirrors claude.ts getClient) ──────────────────────
_client: Anthropic | None = None


def get_client() -> Anthropic:
    """Return a lazily-constructed singleton Anthropic client.

    Reads the key from ``settings.anthropic_api_key_parsing`` (a project-specific
    name so it never collides with a global ``ANTHROPIC_API_KEY``). Raises a
    clear error if unset. Retries are bumped to 4 to ride out transient 5xx,
    matching ``claude.ts``.
    """
    global _client
    if _client is None:
        from anthropic import Anthropic

        secret = settings.anthropic_api_key_parsing
        key = secret.get_secret_value() if secret is not None else None
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY_PARSING is not set. Add it to the worker "
                "environment / backend .env (it moved off Vercel into the "
                "worker per ADR 0007 §3)."
            )
        _client = Anthropic(api_key=key, max_retries=4)
    return _client


# ── Worker tool definition (schema built from pydantic, not hand-written) ────
def _worker_tool() -> ToolParam:
    # ``input_schema`` is a broad ``dict[str, Any]`` from pydantic; the Anthropic
    # ToolParam TypedDict wants its narrower ``InputSchema`` shape, so cast (the
    # TS source does the same: ``recipeJsonSchema as Anthropic.Tool[...]``).
    tool: dict[str, Any] = {
        "name": "extract_recipe",
        "description": "Extract the full recipe into structured JSON",
        "input_schema": Recipe.model_json_schema(),
    }
    return cast("ToolParam", tool)


def _run_worker(
    client: Anthropic, system_text: str, content: str | list[dict[str, Any]]
) -> Message:
    """Issue the forced ``extract_recipe`` tool call shared by all 3 parsers.

    ``content`` is a plain user-message string (URL/video) or a list of content
    blocks (image); it is cast to the Anthropic content type.
    """
    system: list[TextBlockParam] = [
        {"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}
    ]
    tool_choice: ToolChoiceToolParam = {"type": "tool", "name": "extract_recipe"}
    messages: list[MessageParam] = [{"role": "user", "content": cast("Any", content)}]
    return client.messages.create(
        model=WORKER_MODEL,
        max_tokens=WORKER_MAX_TOKENS,
        system=system,
        tools=[_worker_tool()],
        tool_choice=tool_choice,
        messages=messages,
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


# ── parseRecipeFromImage ─────────────────────────────────────────────────────
def parse_recipe_from_image(data: bytes, media_type: str) -> RecipeParseResult:
    """Parse a recipe from an image (Haiku, ``extract_recipe`` tool).

    ``data`` is raw image bytes; it is base64-encoded here for the Anthropic
    image content block.
    """
    client = get_client()
    system_text = WORKER_SYSTEM_BASE
    base64_str = _base64.standard_b64encode(data).decode("ascii")

    user_content: list[dict[str, Any]] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64_str,
            },
        },
        {"type": "text", "text": "Extract the recipe from this image."},
    ]

    response = _run_worker(client, system_text, user_content)

    tool_input = _extract_tool_use_input(response, "worker response")
    recipe = Recipe.model_validate(tool_input)

    worker_prompt = "\n\n".join(
        [
            "SYSTEM:\n" + system_text,
            "USER: [image] Extract the recipe from this image.",
        ]
    )

    return RecipeParseResult(recipe=recipe, worker_prompt=worker_prompt, stripped_text=None)


def _strip_html(raw_html: str) -> str:
    """Port the exact regex strip chain from ``claude.ts`` (scripts/styles/tags
    → whitespace collapse → trim → 30k cap)."""
    stripped = re.sub(r"<script[\s\S]*?</script>", "", raw_html)
    stripped = re.sub(r"<style[\s\S]*?</style>", "", stripped)
    stripped = re.sub(r"<[^>]+>", " ", stripped)
    stripped = re.sub(r"\s+", " ", stripped)
    return stripped.strip()[:STRIPPED_TEXT_CAP]


# ── parseRecipeFromUrl ───────────────────────────────────────────────────────
def parse_recipe_from_url(url: str) -> RecipeParseResult:
    """Fetch a webpage (10s timeout), strip HTML, and parse (URL prompt variant)."""
    client = get_client()

    with httpx.Client(timeout=FETCH_TIMEOUT_S, follow_redirects=True) as http:
        res = http.get(url)
        raw_html = res.text

    stripped_text = _strip_html(raw_html)

    system_text = WORKER_SYSTEM_BASE.replace(
        _RULE_TWO_IMAGE, WORKER_SYSTEM_URL_EXTRA.strip()
    ) + (
        f"\n\nSource URL: {url}. Use the hostname for `source_attribution` if no "
        "explicit byline appears (e.g. 'NYT Cooking', 'Bon Appétit'). Populate "
        "`source_url` with the URL."
    )

    response = _run_worker(client, system_text, stripped_text)

    tool_input = _extract_tool_use_input(response, "URL worker response")
    recipe = Recipe.model_validate(tool_input)

    worker_prompt = "\n\n".join(
        [
            "SYSTEM:\n" + system_text,
            "USER:\n" + stripped_text[:500] + "…",
        ]
    )

    return RecipeParseResult(
        recipe=recipe, worker_prompt=worker_prompt, stripped_text=stripped_text
    )


# ── parseRecipeFromVideoText ─────────────────────────────────────────────────
def parse_recipe_from_video_text(
    caption: str, transcript: str, source_url: str
) -> RecipeParseResult:
    """Parse a recipe from short-form video caption + transcript (VIDEO variant)."""
    client = get_client()

    if not caption.strip() and not transcript.strip():
        raise RuntimeError("No video transcript or caption text was available")

    stripped_text = (
        "\n\n".join(
            [
                f"CAPTION:\n{caption.strip() or '(none)'}",
                f"TRANSCRIPT:\n{transcript.strip() or '(none)'}",
            ]
        )
    )
    stripped_text = re.sub(r"\s+\n", "\n", stripped_text).strip()[:STRIPPED_TEXT_CAP]

    system_text = WORKER_SYSTEM_BASE.replace(
        _RULE_TWO_IMAGE, WORKER_SYSTEM_VIDEO_EXTRA.strip()
    ) + (
        f"\n\nSource URL: {source_url}. Populate `source_url` with the URL. Use the "
        "platform or creator name for `source_attribution` when available."
    )

    response = _run_worker(client, system_text, stripped_text)

    tool_input = _extract_tool_use_input(response, "video worker response")
    recipe = Recipe.model_validate(tool_input)

    worker_prompt = "\n\n".join(
        [
            "SYSTEM:\n" + system_text,
            "USER:\n" + stripped_text[:500] + "…",
        ]
    )

    return RecipeParseResult(
        recipe=recipe, worker_prompt=worker_prompt, stripped_text=stripped_text
    )
