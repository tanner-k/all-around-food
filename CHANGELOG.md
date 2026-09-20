# Changelog

## 2026-07-04
- Archived migrated core Parquet files under `data/archive/` after Supabase row counts matched.
- Cut over the app from hosted server proxies to Supabase reads/writes plus the local import worker.
- Removed the deferred user-facing pricing surface while keeping the backend pricing library.
- Deleted the Python HTTP server, proxy routes, and core Parquet store path after adding Supabase evaluation stats.

## 2026-06-07
- Text shopping list to any number via Apple Messages

> Shipped work, newest first. Promoted from `TODO.md` via `python3 scripts/done.py "description"`.

## Conventions
- Group by date (ISO `YYYY-MM-DD`).
- Each entry = one shipped change, written in past tense.
- The top 5 entries get pulled into `README.md`'s "Recent updates" section (between the `<!-- BEGIN:RECENT-UPDATES -->` / `<!-- END:RECENT-UPDATES -->` markers).
- Never edit historical entries — append a follow-up entry instead.

<!-- Newest first -->

## [Unreleased] — Phase D

**Added**

- Pantry inventory at `/pantry` — add items by hand or upload a grocery receipt; each item tracks a stock status (in stock / low / out) and is auto-grouped by aisle.
- Receipt import — upload a receipt photo, parsed by `claude-haiku-4-5` vision into grocery line items for review, then bulk-added to the pantry as `in_stock`.
- Smart shopping list at `/shop` — manual entry plus "add from recipes" (aggregates + dedupes recipe ingredients); grouped by aisle; pantry-covered items hidden, low items badged.
- Post-cook "what did you run out of?" step — after marking a recipe cooked, update the stock status of its pantry-tracked ingredients so the shopping list stays accurate.
- Weekly meal planner at `/plan` — a 7-day grid; assign a recipe to each day's dinner slot (plus an optional lunch) via a recipe picker; "Review shopping →" turns the planned week into the shopping list.
- Backend: `PantryStore`, `ShoppingListStore`, and `MealPlanStore` (immutable Polars/parquet stores); pantry + shopping-list CRUD endpoints; `GET`/`PUT /meal-plans/{week_of}`; `POST /shopping-list/generate`; keyword-based aisle categorization (`aisles.py`); name normalization (`naming.py`); pantry-subtraction + recipe-aggregation logic (`shopping_logic.py`).
- `frontend/src/lib/api.ts` — browser-side API client for pantry + shopping endpoints; `backend-proxy.ts` shared proxy helper; `pantry-schema.ts` / `shopping-schema.ts` Zod contracts.
- New backend tests across the pantry/shopping stores, aisle categorization, name normalization, smart-list logic, and pantry + shopping API endpoints.

**Changed**

- `DropZone` and `ParsingProgress` made reusable — `DropZone` gains a `variant` prop (recipe vs receipt) and optional `onUrl`; `ParsingProgress` gains a configurable `steps` prop.
- `CookDoneView` now flows into the post-cook pantry check after marking a recipe cooked, instead of navigating straight back to the recipe.

## [Unreleased] — Phase C

**Added**

- Recipe detail page at `/cookbook/[id]` — magazine-style view with hero, meta pills, grouped ingredients, inline-amount steps.
- Immersive cook mode at `/cookbook/[id]/cook` — two layouts (one-step-at-a-time and full-scroll with sticky ingredient panel), user-toggleable, choice persisted in `localStorage`.
- Per-step countdown timer in cook mode (tap a step with a duration).
- "Done" screen with a `Mark as cooked` action that increments `times_made`.
- Edit a saved recipe at `/cookbook/[id]/edit` — structured form, add/remove ingredient + step rows.
- Backend: `PUT /recipes/{id}` (full edit) and `POST /recipes/{id}/cooked` (increment times_made) endpoints; `RecipeStore.update()` and `RecipeStore.get()` methods.
- `InlineAmountText` shared component — inline-amount step rendering extracted from `RecipeReview` and reused across detail + cook mode.
- Responsive layouts for the recipe detail, cook mode, and edit screens.
- 8 new backend tests (recipe update, get-by-id, mark-cooked endpoints).

**Changed**

- `/cookbook` recipe cards now link to the recipe detail page.
- `GET /recipes/{id}` refactored to use `RecipeStore.get()` instead of scanning all recipes.

## [Unreleased] — Phase B

**Added**

- FastAPI backend at `backend/src/allaroundfood/api.py` with endpoints: `GET /healthz`, `POST /recipes`, `GET /recipes`, `GET /recipes/{id}`, `POST /evaluations`, `GET /evaluations`, `GET /evaluations/stats`.
- Structured Recipe schema (Quantity / Ingredient / Step / NutritionPerServing + 20+ fields on Recipe) shared between Pydantic (backend) and Zod (frontend).
- Claude-powered recipe parsing: vision (screenshot) and URL → structured Recipe using `claude-haiku-4-5` via tool-use forced JSON output.
- LLM-as-judge evaluation pipeline: every parse is graded by `claude-sonnet-4-6` on overall/accuracy/completeness (0–10 each); results stored in `data/evaluations.parquet`.
- Fire-and-forget grading: parse returns to user immediately; eval is posted to backend asynchronously; failures don't block save flow.
- `/import` page with full flow: DropZone → ParsingProgress (fake-progress animation) → RecipeReview (editable title, ingredient list with inline `.amt` pills) → SavedConfirmation.
- `/cookbook` list view with `.rcard` grid (2-column, 16:9 hero placeholder, title, recipe count).
- `/evaluations` dev dashboard with stats strip (Count / Mean Overall / Mean Accuracy / Mean Completeness) and expandable eval table (grade chips, field checks, reasoning, suggested improvements).
- New backend tests: `test_api.py` covering all endpoints + health check + backward-compat parquet load; extended `test_storage.py` for new Recipe fields; new `test_eval_storage.py` for EvalStore (4 tests).
- `frontend/.env.local.example` documenting required env vars (ANTHROPIC_API_KEY, BACKEND_URL).
- `docs/evaluations.md` — full guide to the evaluation pipeline: purpose, schemas, grading prompt, dashboard reading, iteration workflow, retention notes.

**Changed**

- Backend Recipe schema expanded from 6 fields to 20+ (now includes prep_time_min, cook_time_min, total_time_min, servings, yield_text, equipment, cuisine, course, dietary_tags, difficulty, nutrition, notes, storage_instructions, times_made, parse_confidence).
- `storage.py` Polars schema extended to store all Recipe fields as columns or JSON-encoded nested structures; Phase A parquet files load backward-compatibly.
- Backend `models.py` now includes full `Evaluation` model and `JudgeFieldCheck` model (plus the expanded `Recipe` and new nested models: `Quantity`, `Ingredient`, `Step`, `NutritionPerServing`).
- Updated `README.md` with "Run Phase B locally" section: step-by-step terminal split setup, env config, expected URLs.

## 2026-05-19
- Scaffolded project from the Tree template
