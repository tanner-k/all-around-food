"""Pydantic models for All Around Food."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


class Quantity(BaseModel):
    """Represents a quantity of an ingredient."""

    value: float | None = None
    unit: str | None = None
    as_written: str


class Ingredient(BaseModel):
    """Represents a recipe ingredient."""

    name: str
    quantity: Quantity
    preparation: str | None = None
    optional: bool = False
    group: str | None = None
    notes: str | None = None


class Step(BaseModel):
    """Represents a recipe step."""

    order: int
    instruction: str
    duration_min: float | None = None
    temperature_f: int | None = None
    equipment: list[str] = Field(default_factory=list)
    inline_amounts: list[str] = Field(default_factory=list)


class NutritionPerServing(BaseModel):
    """Represents nutrition information per serving."""

    kcal: int | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    sugar_g: float | None = None
    sodium_mg: float | None = None


class Recipe(BaseModel):
    """Represents a complete recipe."""

    id: str
    title: str
    description: str | None = None
    source_url: str | None = None
    source_attribution: str | None = None
    prep_time_min: int | None = None
    cook_time_min: int | None = None
    total_time_min: int | None = None
    servings: int | None = None
    yield_text: str | None = None
    ingredients: list[Ingredient] = Field(min_length=1)
    steps: list[Step] = Field(min_length=1)
    equipment: list[str] = Field(default_factory=list)
    cuisine: str | None = None
    course: str | None = None
    dietary_tags: list[str] = Field(default_factory=list)
    difficulty: Literal["easy", "medium", "hard"] | None = None
    nutrition: NutritionPerServing | None = None
    notes: str | None = None
    storage_instructions: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    times_made: int = 0
    parse_confidence: float | None = Field(default=None, ge=0.0, le=1.0)


PantryStatus = Literal["in_stock", "low", "out"]
Aisle = Literal[
    "Produce",
    "Dairy",
    "Meat",
    "Bakery",
    "Pantry",
    "Frozen",
    "Beverages",
    "Household",
    "Other",
]


class PantryItem(BaseModel):
    """Represents an item in the pantry inventory."""

    id: str
    name: str
    status: PantryStatus = "in_stock"
    aisle: Aisle = "Other"
    aisle_overridden: bool = False
    notes: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ShoppingListItem(BaseModel):
    """Represents an item on the shopping list."""

    id: str
    name: str
    quantity_text: str | None = None
    aisle: Aisle = "Other"
    checked: bool = False
    source: Literal["manual", "recipe", "planner"] = "manual"
    source_recipe_id: str | None = None
    pantry_covered: bool = False
    pantry_low: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class JudgeFieldCheck(BaseModel):
    """Represents a judge's assessment of a specific field."""

    field: str
    issue: Literal["missing", "incorrect", "hallucinated", "fine"]
    detail: str


class Evaluation(BaseModel):
    """Represents an evaluation of a recipe extraction."""

    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source_kind: Literal["image", "url"]
    source_ref: str
    worker_model: str
    worker_prompt: str
    worker_output: str
    worker_parse_confidence: float | None = None
    judge_model: str
    judge_prompt: str
    overall_grade: int = Field(ge=0, le=10)
    accuracy_grade: int = Field(ge=0, le=10)
    completeness_grade: int = Field(ge=0, le=10)
    strengths: list[str]
    weaknesses: list[str]
    field_checks: list[JudgeFieldCheck] = Field(default_factory=list)
    reasoning: str
    suggested_prompt_improvements: str | None = None
    raw_judge_output: str
