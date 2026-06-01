# backend/

> **This backend is retired for v1.** See ADR 0002 (`docs/decisions/0002-vercel-fullstack.md`).

## Status

The Python/Polars backend has been archived to `backend/_legacy/`. Do not add new code here.

- `backend/_legacy/src/allaroundfood/models.py` — **Pydantic models; the schema source of truth for the Drizzle ORM port (task T2).** Do not delete this file until the Drizzle schema in `frontend/src/db/schema.ts` has been accepted.
- `backend/_legacy/pyproject.toml` / `uv.lock` — archived Python deps.
- `backend/_legacy/tests/` — archived Python tests.

## Where business logic lives now

Business logic is implemented as **Next.js route handlers and server actions** in `frontend/src/app/api/` and `frontend/src/app/(app)/`. See `frontend/context.md` for conventions.

## Why archived, not deleted

The Pydantic models in `_legacy/src/allaroundfood/models.py` capture the canonical data shape (Recipe, Ingredient, Step, etc.). Task T2 uses them as the authoritative reference when generating the Drizzle schema. Once T2 is merged and accepted, this directory can be removed in a follow-up task.
