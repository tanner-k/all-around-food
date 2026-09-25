"""Local recipe parsing; legacy grading loads only when explicitly requested."""

from __future__ import annotations

from typing import Any

from allaroundfood.parsing.recipe_parser import (
    RecipeParseResult,
    parse_recipe_from_image,
    parse_recipe_from_text,
    parse_recipe_from_url,
    parse_recipe_from_video_text,
)

__all__ = [
    "GradeResult",
    "RecipeImageSource",
    "RecipeParseResult",
    "RecipeUrlTextSource",
    "grade_recipe_parse",
    "parse_recipe_from_image",
    "parse_recipe_from_text",
    "parse_recipe_from_url",
    "parse_recipe_from_video_text",
]


def __getattr__(name: str) -> Any:
    if name in {"GradeResult", "RecipeImageSource", "RecipeUrlTextSource", "grade_recipe_parse"}:
        from allaroundfood.parsing import judge

        return getattr(judge, name)
    raise AttributeError(name)
