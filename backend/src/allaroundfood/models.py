"""Pydantic models for All Around Food."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    """Represents a recipe ingredient."""

    name: str
    amount: float | None = None
    unit: str | None = None
    notes: str | None = None


class Step(BaseModel):
    """Represents a recipe step."""

    order: int
    text: str


class Recipe(BaseModel):
    """Represents a complete recipe."""

    id: str
    title: str
    source_url: str | None = None
    ingredients: list[Ingredient]
    steps: list[Step]
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
