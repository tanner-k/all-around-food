# data/

> **For v1, the schema source of truth has moved.** See ADR 0002.

## Scope

This directory retains reference data files (e.g. sample Parquet exports) and the legacy Polars-era artifacts for historical context. Active schema work lives in `frontend/src/db/`.

- **Schema / migrations:** `frontend/src/db/schema.ts` (Drizzle ORM) + `frontend/src/db/migrations/` — owned by task T2.
- **Seed data:** `frontend/src/db/seed.ts` — owned by task T2.
- **Legacy Pydantic models (schema reference):** `backend/_legacy/src/allaroundfood/models.py` — do not delete until T2 is accepted.

## Not in scope
- API endpoints → `frontend/src/app/api/`
- UI-side data shaping → `frontend/`
- Infrastructure provisioning the database → `infra/`

## Stack
Postgres via Drizzle ORM (Vercel Postgres / Neon). Parquet/Polars is retired for v1.

## Migration workflow (Drizzle)
1. Edit `frontend/src/db/schema.ts` with the new tables/columns.
2. Run `pnpm --filter frontend drizzle-kit generate` to produce a migration file.
3. Verify the generated SQL and commit it alongside the schema change.
4. Migrations run on deploy (see task T9 for the deploy step).

## Notes for agents
- Never edit a migration that has shipped to `main` — write a new one.
- Schema changes must be coordinated with any route handler or server action that relies on the changed shape.
- Test data lives in `frontend/src/db/seed.ts` — keep it small and meaningful, not exhaustive.
