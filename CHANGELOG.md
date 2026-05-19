# Changelog

> Shipped work, newest first. Promoted from `TODO.md` via `python3 scripts/done.py "description"`.

## Conventions
- Group by date (ISO `YYYY-MM-DD`).
- Each entry = one shipped change, written in past tense.
- The top 5 entries get pulled into `README.md`'s "Recent updates" section (between the `<!-- BEGIN:RECENT-UPDATES -->` / `<!-- END:RECENT-UPDATES -->` markers).
- Never edit historical entries — append a follow-up entry instead.

<!-- Newest first -->

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
