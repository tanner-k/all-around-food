"""FastAPI application for All Around Food."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from allaroundfood.eval_storage import EvalStore
from allaroundfood.models import Evaluation, Recipe
from allaroundfood.storage import RecipeStore

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
RECIPE_STORE_PATH = DATA_DIR / "recipes.parquet"
EVAL_STORE_PATH = DATA_DIR / "evaluations.parquet"

app = FastAPI(title="All Around Food", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_recipe_store_path() -> Path:
    """Get the recipe store path (for test injection via monkeypatch)."""
    return RECIPE_STORE_PATH


def _get_eval_store_path() -> Path:
    """Get the eval store path (for test injection via monkeypatch)."""
    return EVAL_STORE_PATH


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint — returns API metadata. Silences the 404 on bare /."""
    return {
        "service": "all-around-food",
        "version": "0.2.0",
        "docs": "/docs",
        "health": "/healthz",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    """Empty favicon to silence browser 404s."""
    return Response(status_code=204)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/recipes")
async def post_recipe(recipe: Recipe) -> Recipe:
    """Save a recipe and return it.

    Args:
        recipe: Recipe to save.

    Returns:
        Saved Recipe.
    """
    store_path = _get_recipe_store_path()
    store = RecipeStore.load(store_path).add(recipe)
    store.save()
    return recipe


@app.get("/recipes")
async def get_recipes() -> list[Recipe]:
    """Get all recipes sorted by created_at descending.

    Returns:
        List of all recipes.
    """
    store_path = _get_recipe_store_path()
    store = RecipeStore.load(store_path)
    recipes = store.all()
    # Sort by created_at descending
    recipes.sort(key=lambda r: r.created_at, reverse=True)
    return recipes


@app.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str) -> Recipe:
    """Get a single recipe by ID.

    Args:
        recipe_id: ID of the recipe to retrieve.

    Returns:
        Recipe with the given ID.

    Raises:
        HTTPException: If recipe not found.
    """
    store_path = _get_recipe_store_path()
    store = RecipeStore.load(store_path)
    recipes = store.all()
    for recipe in recipes:
        if recipe.id == recipe_id:
            return recipe
    raise HTTPException(status_code=404, detail="Recipe not found")


@app.post("/evaluations")
async def post_evaluation(evaluation: Evaluation) -> Evaluation:
    """Save an evaluation and return it.

    Args:
        evaluation: Evaluation to save.

    Returns:
        Saved Evaluation.
    """
    store_path = _get_eval_store_path()
    store = EvalStore.load(store_path).add(evaluation)
    store.save()
    return evaluation


@app.get("/evaluations")
async def get_evaluations() -> list[Evaluation]:
    """Get all evaluations sorted by created_at descending.

    Returns:
        List of all evaluations.
    """
    store_path = _get_eval_store_path()
    store = EvalStore.load(store_path)
    return store.all()


@app.get("/evaluations/stats")
async def get_evaluation_stats() -> dict[str, Any]:
    """Get evaluation statistics.

    Returns:
        Dictionary with aggregated stats.
    """
    store_path = _get_eval_store_path()
    store = EvalStore.load(store_path)
    return store.stats()
