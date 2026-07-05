# Plan: Supabase Cutover — retire the hosted-backend path (Phase 6, pricing deferred)

**Status:** Proposed
**Date:** 2026-07-04
**Owner:** Tanner
**Parent plan:** [`personal-supabase-pivot.md`](./personal-supabase-pivot.md) — this executes Phase 6 and the evals half of Phase 5.
**Decision record:** [ADR 0007](../decisions/0007-personal-supabase-rearchitecture.md)

## Scope decisions (2026-07-04)

1. **Pricing is deferred entirely.** The pricing library (`backend/.../pricing/` adapters,
   canonical matching, analytics, Parquet stores, and their tests) stays as-is. Only the
   user-facing surface comes out. The Postgres/pgvector pricing migration moves to a future
   plan (tables already exist in `supabase/migrations/0001_init.sql`, so nothing blocks it).
2. **The FastAPI backend is deleted**, not kept as a dev tool. Git history is the archive.
3. **Evals dashboard moves to Supabase reads.** The worker already writes `evaluations`
   rows (`RUN_EVALS`); only the read path is missing.

## Current state (verified 2026-07-04)

- Phases 1–4 of the pivot are built: Supabase migrations `0001`–`0003`, auth + middleware,
  `lib/db/*` for recipes / meal plans / pantry / shopping / parse jobs, queue-based import,
  and a 514-line `worker.py` handling all five kinds with best-effort evals.
- `backend/scripts/migrate_parquet_to_supabase.py` exists for the data move.
- Still on the old path: `/evaluations` and `/prices` pages fetch `BACKEND_URL`; the
  `frontend/src/app/api/*` proxy routes, `backend-proxy.ts`, `backend-url.ts`, `lib/api.ts`,
  and `lib/claude.ts` all still exist; FastAPI (`api.py`) and the core Parquet `*Store`
  classes still exist; docs/ADRs still describe the hosted architecture.
- Working tree is clean (only untracked `.claude/`); `dev` is ahead of `main`.

---

## W1 — Pre-flight: verify data is in Supabase

Nothing gets deleted until the data demonstrably lives in Supabase.

- Run (or confirm a prior run of) `backend/scripts/migrate_parquet_to_supabase.py`.
- Compare row counts: `data/{recipes,meal_plans,pantry,shopping_list,evaluations}.parquet`
  vs the corresponding Supabase tables.
- Archive the core parquet files (e.g. `data/archive/`) — do **not** touch `data/pricing/`
  paths or `data/receipts.parquet` (worker OCR path, deferred with pricing).
- **Acceptance:** row counts match; app pages render the same data from `lib/db/*`.

## W2 — Evals dashboard on Supabase

- Add `frontend/src/lib/db/evaluations.ts`: list query + stats. Compute stats via a
  Postgres view or RPC (mirror the shapes `/evaluations` and `/evaluations/stats`
  returned) rather than client-side aggregation over all rows — new migration `0004` if
  a view/RPC is used.
- Rewrite `frontend/src/app/(app)/evaluations/page.tsx` to use it; delete
  `frontend/src/app/api/evaluations/`.
- **Acceptance:** dashboard renders worker-written rows and stats with `BACKEND_URL` unset.

## W3 — Remove the pricing surface (defer, don't migrate)

- Delete `frontend/src/app/(app)/prices/` and `frontend/src/lib/pricing-client.ts`, and
  the pricing entry in the nav. (A feature flag was considered, but with the backend
  deleted the page can never render — removal is the honest gate. Revival is tracked in
  `grocery-price-tracking.md` + a future pricing-migration plan.)
- Delete `frontend/src/app/api/pricing/`.
- Keep everything under `backend/src/allaroundfood/pricing/` and its tests, including the
  worker's receipt→observation path.
- **Acceptance:** no user-facing pricing entry point; pricing lib tests still pass.

## W4 — Delete FastAPI + proxies + dead code

Frontend:

- Delete remaining `frontend/src/app/api/*` routes (`import`, `recipes`, `meal-plans`,
  `pantry`, `shopping-list`), `lib/backend-proxy.ts`, `lib/backend-url.ts`.
- Delete `lib/claude.ts` (parsing lives in the worker) and prune `lib/api.ts` — keep only
  what pages still import (e.g. `isVideoRecipeUrl()`, used by `DropZone`); drop dead
  `parseVideoUrl()` (polish-roadmap P1.4).
- Env: remove `BACKEND_URL` and `ANTHROPIC_API_KEY_PARSING` from
  `frontend/.env.local.example` and Vercel (the Anthropic key is worker-only now).

Backend:

- Delete `api.py`, the server entry in `__main__.py`, `pricing/api/`, and the core Parquet
  stores once W1 is verified: `storage.py`, `meal_plan_storage.py`, `pantry_storage.py`,
  `shopping_storage.py`, `eval_storage.py`.
- Keep: `worker.py`, `supabase_client.py`, `parsing/`, `ocr/`, `transcription.py`,
  `video_import.py`, `pricing/` (minus `pricing/api/`), `messaging/`, `models.py`,
  `config.py`, and pure-logic modules (`aisles.py`, `naming.py`, `shopping_logic.py`)
  where the worker still uses them.
- Tests: delete `test_api.py`, `test_storage.py`, `test_meal_plan_storage.py`,
  `test_pantry_storage.py`, `test_shopping_storage.py`, `test_eval_storage.py`,
  `pricing/api/test_routes.py`. Keep worker / parsing / ocr / transcription /
  video-import / pricing-lib / logic tests.
- Drop FastAPI/uvicorn from `pyproject.toml` if nothing else imports them; prune
  `backend/.env.example` accordingly.
- **Acceptance:** `rg "BACKEND_URL|backend-proxy|backend-url|lib/claude|fastapi"` across
  `frontend/src` and `backend/src` returns nothing (pricing-lib exceptions noted inline);
  full lint/type/test suites green.

## W5 — Docs truth pass

All in one PR; `CLAUDE.md` and `AGENTS.md` change identically in the same commit.

- `CLAUDE.md`/`AGENTS.md`: §2 working-state (replace the Polars-stub criterion with
  "supabase migrations applied + `worker --once` drains a test job"), §3 project map,
  §7 deploy (Vercel PWA + local worker; no hosted backend), §8 stack (add Supabase;
  correct Next 16 / React 19).
- `README.md`: getting-started becomes Supabase env + `pnpm dev` + worker instructions;
  remove backend-server sections.
- `docs/architecture.md`, `backend/context.md`, `frontend/context.md`, `data/context.md`
  (data/ is now archive + models + pricing-deferred paths).
- ADRs: mark 0001 (infra portion) and 0005 superseded-by-0007 in their headers; flip
  ADR 0007 **Proposed → Accepted**; add a "superseded by personal-supabase-pivot" note
  atop `polish-roadmap.md`.
- `TODO.md`: prune audit follow-ups that assumed the hosted backend (`BACKEND_URL`
  reachability, backend deploy, shopping-list `/api` route items); promote or archive
  stale `- [x]` lines; rewrite the shopping-list-upload items as worker-kind tasks
  (the `shopping_list` kind already exists in the worker — mostly done).
- **Acceptance:** `rg "deploy-ec2|deploy-vercel|Next.js 15|FastAPI|BACKEND_URL"` over the
  doc set returns only historical ADR/changelog mentions.

## W6 — Verify + land

- `pnpm lint && pnpm build`; `uv run ruff check && uv run mypy && uv run pytest`.
- Manual smoke: sign in → enqueue a URL import → `worker --once` → recipe appears in the
  PWA → evals dashboard shows the new row.
- Land as small PRs to `dev`, suggested slicing: **PR1** W1+W2 (evals on Supabase),
  **PR2** W3+W4 (deletions — CI proves nothing depended on the removed code),
  **PR3** W5 (docs). Each PR green before the next.
- Update `CHANGELOG.md` via `scripts/done.py` as items complete.

## Out of scope

- Pricing Postgres/pgvector migration, adapter validation, data seeding (future plan).
- Mobile responsive pass, Playwright E2E, worker cron/launchd install, Supabase
  keep-alive — next roadmap items after cutover.

## Sequencing

```
W1 (verify data) ─► W2 (evals reads) ─► W3 (pricing surface out) ─► W4 (delete backend)
                                                                          │
                                                       W5 (docs) ─► W6 (verify + land)
```
