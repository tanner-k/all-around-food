"""FastAPI application for All Around Food."""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from allaroundfood.aisles import AISLE_ORDER, categorize
from allaroundfood.eval_storage import EvalStore
from allaroundfood.meal_plan_storage import MealPlanStore
from allaroundfood.messaging import (
    MessagingError,
    format_shopping_list,
    normalize_phone,
    send_imessage,
)
from allaroundfood.models import (
    Evaluation,
    MealPlan,
    PantryItem,
    PantryStatus,
    Recipe,
    ShoppingListItem,
    VideoImportResult,
)
from allaroundfood.naming import normalize_name
from allaroundfood.ocr.api import router as ocr_router
from allaroundfood.pantry_storage import PantryStore
from allaroundfood.pricing.api import router as pricing_router
from allaroundfood.shopping_logic import (
    aggregate_recipe_ingredients,
    build_shopping_list_response,
    recompute_all_flags,
)
from allaroundfood.shopping_storage import ShoppingListStore
from allaroundfood.storage import RecipeStore
from allaroundfood.video_import import (
    VideoImportError,
    VideoImportSettings,
    check_video_import_binaries,
    fetch_video_text,
)

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
RECIPE_STORE_PATH = DATA_DIR / "recipes.parquet"
EVAL_STORE_PATH = DATA_DIR / "evaluations.parquet"
PANTRY_STORE_PATH = DATA_DIR / "pantry.parquet"
SHOPPING_STORE_PATH = DATA_DIR / "shopping_list.parquet"
MEAL_PLAN_STORE_PATH = DATA_DIR / "meal_plans.parquet"

@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run startup checks for the FastAPI app.

    Implements the follow-up from ADR 0002: warn if yt-dlp or ffmpeg are
    not resolvable on PATH before the first /recipes/parse-video call.
    """
    status = check_video_import_binaries()
    if status.missing:
        logger.warning(
            "Video import binaries missing on PATH: %s. "
            "Set YTDLP_BIN/FFMPEG_BIN or activate the backend venv before "
            "calling /recipes/parse-video.",
            ", ".join(status.missing),
        )
    else:
        logger.info(
            "Video import binaries resolved: yt-dlp=%s ffmpeg=%s",
            status.ytdlp,
            status.ffmpeg,
        )
    logger.info(
        "Video transcription uses in-process whisper.cpp model: %s",
        VideoImportSettings.from_env().whisper_model,
    )
    yield


app = FastAPI(title="All Around Food", version="0.2.0", lifespan=_lifespan)

app.include_router(pricing_router)
app.include_router(ocr_router)

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


def _get_pantry_store_path() -> Path:
    """Get the pantry store path (for test injection via monkeypatch)."""
    return PANTRY_STORE_PATH


def _get_shopping_store_path() -> Path:
    """Get the shopping store path (for test injection via monkeypatch)."""
    return SHOPPING_STORE_PATH


def _get_meal_plan_store_path() -> Path:
    """Get the meal-plan store path (for test injection via monkeypatch)."""
    return MEAL_PLAN_STORE_PATH


def _refresh_shopping_flags() -> None:
    """Recompute pantry flags across the whole shopping list and persist.

    Called after every pantry write so the shopping list stays in sync with
    what's on hand.
    """
    pantry = PantryStore.load(_get_pantry_store_path()).all()
    store = ShoppingListStore.load(_get_shopping_store_path())
    refreshed = recompute_all_flags(store.all(), pantry)
    rebuilt = ShoppingListStore(_get_shopping_store_path())
    for item in refreshed:
        rebuilt = rebuilt.add(item)
    rebuilt.save()


def _stock_pantry(
    items: list[ShoppingListItem], pantry: PantryStore, now: datetime
) -> tuple[PantryStore, int, int]:
    """Upsert purchased shopping items into the pantry as in-stock.

    Existing pantry items (matched by normalized name) are refreshed to
    ``in_stock``; unknown items are added, reusing the shopping item's aisle.

    Args:
        items: The purchased shopping-list items.
        pantry: The current pantry store.
        now: Timestamp to stamp on the upserted items.

    Returns:
        Tuple of (new pantry store, count added, count updated).
    """
    added = 0
    updated = 0
    for item in items:
        name = normalize_name(item.name)
        if not name:
            continue
        existing = pantry.get_by_name(name)
        if existing is None:
            pantry = pantry.add(
                PantryItem(
                    id=str(uuid.uuid4()),
                    name=name,
                    status="in_stock",
                    aisle=item.aisle,
                    created_at=now,
                    updated_at=now,
                )
            )
            added += 1
        else:
            pantry = pantry.update(
                existing.id,
                existing.model_copy(
                    update={"status": "in_stock", "updated_at": now}
                ),
            )
            updated += 1
    return pantry, added, updated


def _aisle_sort_key(item: PantryItem) -> tuple[int, str]:
    """Sort key ordering pantry items by aisle (AISLE_ORDER) then name."""
    aisle_index = (
        AISLE_ORDER.index(item.aisle) if item.aisle in AISLE_ORDER else len(AISLE_ORDER)
    )
    return (aisle_index, item.name)


class PantryStatusUpdate(BaseModel):
    """Request body for PATCH /pantry/{id}/status."""

    status: PantryStatus


class ReceiptImportRequest(BaseModel):
    """Request body for POST /pantry/receipt-import."""

    names: list[str]


class ShoppingCheckUpdate(BaseModel):
    """Request body for PATCH /shopping-list/items/{id}/check."""

    checked: bool


class GenerateShoppingListRequest(BaseModel):
    """Request body for POST /shopping-list/generate."""

    recipe_ids: list[str]


class TextShoppingListRequest(BaseModel):
    """Request body for POST /shopping-list/text."""

    recipient: str


class VideoImportRequest(BaseModel):
    """Request body for POST /recipes/parse-video."""

    url: str


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


@app.post("/recipes/parse-video")
async def post_parse_video(req: VideoImportRequest) -> VideoImportResult:
    """Fetch caption and transcript text from an Instagram or TikTok video URL.

    Args:
        req: Request with the source video URL.

    Returns:
        Video import result with caption, transcript, and source metadata.

    Raises:
        HTTPException: If URL validation, download, audio extraction, or
            transcription fails.
    """
    try:
        return await fetch_video_text(req.url)
    except VideoImportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


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
    recipe = store.get(recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@app.put("/recipes/{recipe_id}")
async def put_recipe(recipe_id: str, recipe: Recipe) -> Recipe:
    """Update a recipe by ID.

    Args:
        recipe_id: ID of the recipe to update.
        recipe: Updated Recipe data.

    Returns:
        Updated Recipe.

    Raises:
        HTTPException: If recipe not found.
    """
    store_path = _get_recipe_store_path()
    store = RecipeStore.load(store_path)

    # Ensure the recipe ID in the path takes precedence
    recipe_to_save = recipe.model_copy(update={"id": recipe_id})

    try:
        store = store.update(recipe_id, recipe_to_save)
        store.save()
    except KeyError as e:
        raise HTTPException(status_code=404, detail="Recipe not found") from e

    return recipe_to_save


@app.post("/recipes/{recipe_id}/cooked")
async def post_recipe_cooked(recipe_id: str) -> Recipe:
    """Mark a recipe as cooked by incrementing times_made.

    Args:
        recipe_id: ID of the recipe to mark as cooked.

    Returns:
        Updated Recipe with incremented times_made.

    Raises:
        HTTPException: If recipe not found.
    """
    store_path = _get_recipe_store_path()
    store = RecipeStore.load(store_path)

    recipe = store.get(recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Increment times_made
    updated_recipe = recipe.model_copy(update={"times_made": recipe.times_made + 1})
    store = store.update(recipe_id, updated_recipe)
    store.save()

    return updated_recipe


@app.get("/pantry")
async def get_pantry() -> list[PantryItem]:
    """Get all pantry items, sorted by aisle then name.

    Returns:
        List of all pantry items.
    """
    store = PantryStore.load(_get_pantry_store_path())
    items = store.all()
    items.sort(key=_aisle_sort_key)
    return items


@app.post("/pantry")
async def post_pantry_item(item: PantryItem) -> PantryItem:
    """Add a pantry item.

    Normalizes the name, assigns an id when missing, and auto-categorizes
    the aisle unless the request explicitly overrode it.

    Args:
        item: Pantry item to add.

    Returns:
        The saved pantry item.

    Raises:
        HTTPException: If the item name is empty.
    """
    name = normalize_name(item.name)
    if not name:
        raise HTTPException(status_code=400, detail="Item name is required")

    now = datetime.now(UTC)
    aisle = item.aisle if item.aisle_overridden else categorize(name)
    saved = item.model_copy(
        update={
            "id": item.id or str(uuid.uuid4()),
            "name": name,
            "aisle": aisle,
            "created_at": now,
            "updated_at": now,
        }
    )

    store = PantryStore.load(_get_pantry_store_path()).add(saved)
    store.save()
    _refresh_shopping_flags()
    return saved


@app.post("/pantry/receipt-import")
async def post_receipt_import(req: ReceiptImportRequest) -> dict[str, Any]:
    """Bulk-import items from a parsed receipt into the pantry.

    Each name is normalized and upserted: existing items are refreshed to
    ``in_stock``; new items are added and auto-categorized.

    Args:
        req: Request with the list of confirmed item names.

    Returns:
        Dict with the upserted items and added/updated counts.
    """
    store = PantryStore.load(_get_pantry_store_path())
    now = datetime.now(UTC)
    result: list[PantryItem] = []
    added = 0
    updated = 0

    for raw_name in req.names:
        name = normalize_name(raw_name)
        if not name:
            continue
        existing = store.get_by_name(name)
        if existing is None:
            item = PantryItem(
                id=str(uuid.uuid4()),
                name=name,
                status="in_stock",
                aisle=categorize(name),
                created_at=now,
                updated_at=now,
            )
            store = store.add(item)
            added += 1
        else:
            item = existing.model_copy(
                update={"status": "in_stock", "updated_at": now}
            )
            store = store.update(existing.id, item)
            updated += 1
        result.append(item)

    store.save()
    _refresh_shopping_flags()
    return {"items": result, "added": added, "updated": updated}


@app.put("/pantry/{item_id}")
async def put_pantry_item(item_id: str, item: PantryItem) -> PantryItem:
    """Update a pantry item by ID.

    If the aisle differs from the stored value, it is marked as overridden
    so future auto-categorization won't clobber the manual choice.

    Args:
        item_id: ID of the item to update.
        item: Updated pantry item data.

    Returns:
        The updated pantry item.

    Raises:
        HTTPException: If the item is not found or its name is empty.
    """
    store = PantryStore.load(_get_pantry_store_path())
    existing = store.get(item_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    name = normalize_name(item.name)
    if not name:
        raise HTTPException(status_code=400, detail="Item name is required")

    overridden = item.aisle_overridden or item.aisle != existing.aisle
    updated = item.model_copy(
        update={
            "id": item_id,
            "name": name,
            "aisle_overridden": overridden,
            "created_at": existing.created_at,
            "updated_at": datetime.now(UTC),
        }
    )
    store = store.update(item_id, updated)
    store.save()
    _refresh_shopping_flags()
    return updated


@app.patch("/pantry/{item_id}/status")
async def patch_pantry_status(
    item_id: str, body: PantryStatusUpdate
) -> PantryItem:
    """Update a pantry item's stock status.

    Args:
        item_id: ID of the item to update.
        body: Request with the new status.

    Returns:
        The updated pantry item.

    Raises:
        HTTPException: If the item is not found.
    """
    store = PantryStore.load(_get_pantry_store_path())
    existing = store.get(item_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    updated = existing.model_copy(
        update={"status": body.status, "updated_at": datetime.now(UTC)}
    )
    store = store.update(item_id, updated)
    store.save()
    _refresh_shopping_flags()
    return updated


@app.delete("/pantry/{item_id}")
async def delete_pantry_item(item_id: str) -> dict[str, str]:
    """Delete a pantry item by ID.

    Args:
        item_id: ID of the item to delete.

    Returns:
        Confirmation dict.

    Raises:
        HTTPException: If the item is not found.
    """
    store = PantryStore.load(_get_pantry_store_path())
    try:
        store = store.delete(item_id)
    except KeyError as e:
        raise HTTPException(
            status_code=404, detail="Pantry item not found"
        ) from e
    store.save()
    _refresh_shopping_flags()
    return {"status": "deleted", "id": item_id}


@app.get("/shopping-list")
async def get_shopping_list() -> dict[str, Any]:
    """Get the shopping list grouped by aisle.

    All items are returned; pantry stock status is carried on each item.

    Returns:
        Dict with ``groups`` and ``total_visible``.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    return build_shopping_list_response(store.all())


@app.post("/shopping-list/items")
async def post_shopping_item(item: ShoppingListItem) -> ShoppingListItem:
    """Add a manual item to the shopping list.

    Args:
        item: The shopping-list item to add.

    Returns:
        The saved item with computed aisle and pantry flags.

    Raises:
        HTTPException: If the item name is empty.
    """
    name = normalize_name(item.name)
    if not name:
        raise HTTPException(status_code=400, detail="Item name is required")

    saved = item.model_copy(
        update={
            "id": item.id or str(uuid.uuid4()),
            "name": name,
            "aisle": categorize(name),
            "source": "manual",
            "source_recipe_id": None,
            "created_at": datetime.now(UTC),
        }
    )
    pantry = PantryStore.load(_get_pantry_store_path()).all()
    saved = recompute_all_flags([saved], pantry)[0]

    store = ShoppingListStore.load(_get_shopping_store_path()).add(saved)
    store.save()
    return saved


@app.post("/shopping-list/generate")
async def post_generate_shopping_list(
    req: GenerateShoppingListRequest,
) -> dict[str, Any]:
    """Generate recipe-sourced shopping-list items from the given recipes.

    Ingredients are deduped and pantry-subtracted. Existing manual items are
    preserved; previously generated recipe items are replaced.

    Args:
        req: Request with the recipe IDs to draw from.

    Returns:
        The regenerated shopping list, grouped by aisle.
    """
    recipe_store = RecipeStore.load(_get_recipe_store_path())
    recipes = [
        recipe
        for rid in req.recipe_ids
        if (recipe := recipe_store.get(rid)) is not None
    ]
    pantry = PantryStore.load(_get_pantry_store_path()).all()
    recipe_items = aggregate_recipe_ingredients(recipes, pantry)

    store = ShoppingListStore.load(
        _get_shopping_store_path()
    ).replace_recipe_items(recipe_items)
    store.save()
    return build_shopping_list_response(store.all())


@app.delete("/shopping-list/checked")
async def delete_shopping_checked() -> dict[str, Any]:
    """Mark checked items as bought: stock them into the pantry, then remove.

    Returns:
        Dict with the number removed and pantry add/update counts.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    checked = [item for item in store.all() if item.checked]
    pantry, added, updated = _stock_pantry(
        checked, PantryStore.load(_get_pantry_store_path()), datetime.now(UTC)
    )
    pantry.save()
    store.clear_checked().save()
    _refresh_shopping_flags()
    return {
        "status": "cleared",
        "removed": len(checked),
        "pantry_added": added,
        "pantry_updated": updated,
    }


@app.post("/shopping-list/complete")
async def complete_shopping() -> dict[str, Any]:
    """Complete the whole list: stock every item into the pantry, then clear.

    Returns:
        Dict with the number removed and pantry add/update counts.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    items = store.all()
    pantry, added, updated = _stock_pantry(
        items, PantryStore.load(_get_pantry_store_path()), datetime.now(UTC)
    )
    pantry.save()
    store.clear_all().save()
    _refresh_shopping_flags()
    return {
        "status": "completed",
        "removed": len(items),
        "pantry_added": added,
        "pantry_updated": updated,
    }


@app.put("/shopping-list/items/{item_id}")
async def put_shopping_item(
    item_id: str, item: ShoppingListItem
) -> ShoppingListItem:
    """Update a shopping-list item by ID.

    Args:
        item_id: ID of the item to update.
        item: Updated item data.

    Returns:
        The updated item with refreshed pantry flags.

    Raises:
        HTTPException: If the item is not found or its name is empty.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    existing = store.get(item_id)
    if existing is None:
        raise HTTPException(
            status_code=404, detail="Shopping list item not found"
        )

    name = normalize_name(item.name)
    if not name:
        raise HTTPException(status_code=400, detail="Item name is required")

    updated = item.model_copy(
        update={"id": item_id, "name": name, "created_at": existing.created_at}
    )
    pantry = PantryStore.load(_get_pantry_store_path()).all()
    updated = recompute_all_flags([updated], pantry)[0]

    store = store.update(item_id, updated)
    store.save()
    return updated


@app.patch("/shopping-list/items/{item_id}/check")
async def patch_shopping_check(
    item_id: str, body: ShoppingCheckUpdate
) -> ShoppingListItem:
    """Toggle the checked state of a shopping-list item.

    Args:
        item_id: ID of the item to update.
        body: Request with the new checked state.

    Returns:
        The updated item.

    Raises:
        HTTPException: If the item is not found.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    existing = store.get(item_id)
    if existing is None:
        raise HTTPException(
            status_code=404, detail="Shopping list item not found"
        )

    updated = existing.model_copy(update={"checked": body.checked})
    store = store.update(item_id, updated)
    store.save()
    return updated


@app.delete("/shopping-list/items/{item_id}")
async def delete_shopping_item(item_id: str) -> dict[str, str]:
    """Delete a shopping-list item by ID.

    Args:
        item_id: ID of the item to delete.

    Returns:
        Confirmation dict.

    Raises:
        HTTPException: If the item is not found.
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    try:
        store = store.delete(item_id)
    except KeyError as e:
        raise HTTPException(
            status_code=404, detail="Shopping list item not found"
        ) from e
    store.save()
    return {"status": "deleted", "id": item_id}


@app.post("/shopping-list/text")
async def post_text_shopping_list(
    req: TextShoppingListRequest,
) -> dict[str, Any]:
    """Text the current shopping list to a phone number via Apple Messages.

    Unchecked items are formatted by aisle and sent through Messages.app on the
    host Mac. Sending is macOS-only.

    Args:
        req: Request body carrying the recipient phone number.

    Returns:
        Dict with ``sent_to`` (normalized number) and ``item_count``.

    Raises:
        HTTPException: 400 if the list has no unchecked items, 422 if the
            number is invalid, 503 if Messages cannot send (e.g. not a Mac).
    """
    store = ShoppingListStore.load(_get_shopping_store_path())
    body = format_shopping_list(store.all())
    if not body:
        raise HTTPException(
            status_code=400,
            detail="Nothing to send — your shopping list is empty.",
        )

    try:
        recipient = normalize_phone(req.recipient)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    try:
        send_imessage(recipient, body)
    except MessagingError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    item_count = sum(1 for item in store.all() if not item.checked)
    return {"sent_to": recipient, "item_count": item_count}


@app.get("/meal-plans/{week_of}")
async def get_meal_plan(week_of: str) -> MealPlan:
    """Get the meal plan for a given week.

    Args:
        week_of: ISO date of the week's Monday.

    Returns:
        The stored plan, or an empty plan for that week if none exists.
    """
    store = MealPlanStore.load(_get_meal_plan_store_path())
    plan = store.get(week_of)
    if plan is None:
        return MealPlan(week_of=week_of, meals=[])
    return plan


@app.put("/meal-plans/{week_of}")
async def put_meal_plan(week_of: str, plan: MealPlan) -> MealPlan:
    """Create or replace the meal plan for a week.

    Args:
        week_of: ISO date of the week's Monday (takes precedence over body).
        plan: The full meal plan to store.

    Returns:
        The saved meal plan.
    """
    saved = plan.model_copy(
        update={"week_of": week_of, "updated_at": datetime.now(UTC)}
    )
    store = MealPlanStore.load(_get_meal_plan_store_path()).upsert(saved)
    store.save()
    return saved


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
