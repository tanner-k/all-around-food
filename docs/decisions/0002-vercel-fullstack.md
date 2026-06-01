# 0002 — All-Vercel TypeScript-fullstack

**Status:** Accepted  
**Date:** 2026-06-01  
**Supersedes:** 0001

## Context

ADR 0001 deferred the database-infrastructure choice by using Python/Polars with
file-backed Parquet storage, planning to migrate to FastAPI + Postgres once the
data shape was known. The data shape is now known (recipes, ingredients, steps,
meal plans, shopping list, pantry — see `backend/_legacy/src/allaroundfood/models.py`).

The app is a small private-group tool. The cost of maintaining two separate
stacks (Next.js + Python/Polars) outweighs any benefit: separate runtimes,
separate CI jobs, separate deploy targets, and a language context-switch for
every business-logic change.

## Decision

Adopt a single Vercel deployment, TypeScript end-to-end:

- **Runtime:** Next.js 16, App Router
- **Business logic:** Next.js route handlers and server actions (no separate API
  service)
- **Auth:** Auth.js (NextAuth v5), email-allowlist strategy
- **Data:** Drizzle ORM + Vercel Postgres (Neon) — schema port from
  `backend/_legacy/src/allaroundfood/models.py` (future task T2)
- **AI / recipe import:** Anthropic SDK, server-side only (`claude-sonnet-4-6`,
  prompt caching on system prompt)
- **Python/Polars backend:** retired for v1, archived to `backend/_legacy/`
  (not deleted — its Pydantic models remain the schema source of truth for the
  Drizzle port)

## Rationale

- **One language, one deploy.** TypeScript throughout removes the context-switch
  and halves the number of things that can break in CI/deploy.
- **Vercel Postgres is managed.** No EC2, no separate database server to
  provision or patch. Neon's serverless Postgres fits the app's usage pattern.
- **Auth.js v5 + Drizzle** are the idiomatic Next.js 16 pairing with strong
  TypeScript types end-to-end.
- **Data shape is known.** The original reason to defer (`models.py` committed
  previously) no longer applies; we can port directly to a typed Drizzle schema.
- **Reverses the Polars-deferral** from ADR 0001 now that there is no longer an
  advantage to staying file-backed.

## Consequences

- **(positive)** Single deploy target (`frontend/` → Vercel); one CI pipeline;
  one language; managed Postgres with free-tier serverless.
- **(positive)** `backend/_legacy/src/allaroundfood/models.py` is the
  canonical schema reference for task T2 (Drizzle schema port).
- **(tradeoff)** Long-running background tasks (e.g. future scheduled jobs) are
  harder in serverless route handlers; accept this for v1.
- **(tradeoff)** Python tooling (`ruff`, `mypy`, `pytest`) is no longer part of
  the CI gate; future Python scripts (e.g. `scripts/done.py`) remain but are not
  type-checked by default CI.
- **(followup)** T2 must port the Pydantic models to a Drizzle schema. The
  `backend/_legacy/` directory must not be deleted until the Drizzle schema is
  accepted.

## Alternatives considered

- **Keep Polars file-backed.** Avoids Postgres infra cost, but scales poorly
  beyond a handful of users and makes relational queries (join plan → recipes →
  ingredients) awkward. Rejected now that Postgres is free-tier on Vercel.
- **Standalone FastAPI service.** The original Phase B plan from ADR 0001.
  Rejected: adds a second deploy target, second language in CI, and second
  runtime to keep alive — all cost for a private group app where one developer
  maintains both sides.
