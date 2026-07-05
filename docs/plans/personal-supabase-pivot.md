# Plan: Personal Supabase + Local Worker Pivot

**Status:** Proposed
**Date:** 2026-06-29
**Owner:** Tanner
**Decision record:** [ADR 0007](../decisions/0007-personal-supabase-rearchitecture.md)
**Supersedes:** P0 (deploy) and P1 (hosted-backend runnability) of
[`polish-roadmap.md`](./polish-roadmap.md). P2 (pricing) and P3 (E2E/mobile) fold in below.

## Goal

A personal, ~$0/mo setup: a **responsive PWA on Vercel** (sign-in, reads/writes Supabase)
for browsing recipes and planning/cooking on the phone; **Supabase Postgres** as the single
source of truth for *all* data; recipe import that **enqueues a job**; and a **containerized
worker** on the local device — run by cron, portable to the cloud later — that does all the
Claude/whisper/Qwen/embedding parsing and writes finished recipes back to Supabase.

## Locked decisions (from 2026-06-29)

1. **Frontend:** responsive web / PWA on Vercel. Reuse 100% of the existing React UI; no
   native iOS for now.
2. **Migration scope:** **everything** — recipes, meal plans, shopping, pantry, evaluations,
   and pricing (canonical products / SKUs / observations / store locations / receipts).
3. **Worker:** a **Docker container** with a `worker --once` entry point, triggered by
   **cron once a day** locally now and re-hostable as a daily-scheduled cloud container
   later (no rewrite).

## Target architecture

```
 ┌─────────────┐      reads/writes (RLS, auth.uid)      ┌──────────────────────┐
 │  PWA on     │ ───────────────────────────────────▶  │  Supabase            │
 │  Vercel     │      enqueue parse_jobs + upload        │  Postgres + pgvector │
 │ (phone/web) │ ◀───────────────────────────────────  │  Auth · Storage      │
 └─────────────┘        finished recipes appear          └──────────┬───────────┘
                                                                     │ pull pending jobs
                                                                     │ write recipes/results
                                                          ┌──────────▼───────────┐
                                                          │  Local worker (Docker)│
                                                          │  Claude · whisper.cpp │
                                                          │  Qwen OCR · embeddings│
                                                          │  cron `worker --once` │
                                                          └───────────────────────┘
```

Secrets (Anthropic key, Supabase **service-role** key) and heavy native deps (ffmpeg,
yt-dlp, torch, GGUF weights) live **only** in the worker. Vercel holds only the Supabase
URL + **anon** key.

## What is reused vs. changed vs. new

- **Reused:** the entire React UI; the shared `Recipe` schema (`models.py` + `recipe-schema.ts`);
  all parsing brains — `video_import.py`, `ocr/` (Qwen), `transcription.py`, the pricing
  adapters/canonical matcher/analytics, and the LLM-judge eval pipeline.
- **Changed:** the data layer. Every Polars `*Store` and every `/api/...` proxy route is
  replaced by Supabase access. The FastAPI HTTP server is repurposed into the worker.
- **New:** Supabase project (schema + Auth + Storage), sign-in flow, `parse_jobs` queue,
  the worker entry point + Dockerfile + cron, and a one-time data migration.

---

## Phase 1 — Supabase foundation

**Goal:** schema, auth, storage, and existing data all live in Supabase.

- Create the Supabase project (free tier). Enable the **`pgvector`** extension.
- Schema (tables, all with `user_id uuid default auth.uid()`):
  - `recipes` — scalar columns mirror `RecipeStore`; `ingredients`, `steps`, `equipment`,
    `dietary_tags`, `nutrition` as `jsonb`; `created_at`, `times_made`, `parse_confidence`.
  - `meal_plans` / `planned_meals` — week-of + per-slot recipe refs.
  - `shopping_list_items`, `pantry_items` — mirror current stores (status enums included).
  - `evaluations` — eval pipeline columns (`worker_*`, `judge_*`, grades, `field_checks` jsonb).
  - Pricing: `store_locations`, `canonical_products` (with `embedding vector(384)`),
    `retailer_skus`, `price_observations`, `receipts`.
  - `parse_jobs` — see Phase 3.
- **Auth:** email magic-link (single user = you). **RLS** on every table: `user_id = auth.uid()`.
- **Storage:** private bucket `imports/` for uploaded screenshots/photos/receipts.
- **Migration script** `backend/scripts/migrate_parquet_to_supabase.py`: read each
  `data/*.parquet` (and `data/pricing/*`) with Polars, insert into the matching table via
  `supabase-py` (service-role). Idempotent on `id`.
- **Keep-alive:** a weekly GitHub Action (or UptimeRobot) hitting a trivial query so the
  free project doesn't pause after ~1 week idle.
- **Acceptance:** every existing recipe/plan/shopping/pantry/eval/pricing row is queryable
  in Supabase; RLS denies anon reads.

## Phase 2 — PWA frontend on Supabase + sign-in

**Goal:** the existing UI runs on Vercel against Supabase, installable on the phone.

- Add `@supabase/supabase-js`; create server + browser Supabase clients
  (`frontend/src/lib/supabase/{server,client}.ts`).
- Add a **sign-in** page + session middleware; gate `(app)` routes behind auth.
- Replace data access: swap the `lib/api.ts` calls and `/api/...` proxy routes for Supabase
  queries. Server components (`cookbook/page.tsx`, recipe detail, plan, shop, pantry,
  evaluations) query Supabase directly under RLS; mutations (edit recipe, plan a meal,
  check/uncheck shopping items, mark cooked) become Supabase writes.
- **PWA:** add `manifest.webmanifest` + icons + a minimal service worker; finish the
  **responsive/mobile pass** (absorbs polish-roadmap P3.3) so detail/cook/edit/shop/plan
  work at phone widths.
- Deploy to Vercel: env = `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Remove `ANTHROPIC_API_KEY_PARSING` and `BACKEND_URL` from Vercel.
- **Acceptance:** sign in on the phone, browse + edit recipes, build a meal plan and
  shopping list, enter cook mode — all from the deployed PWA.

## Phase 3 — Import becomes a queue

**Goal:** importing never parses inline; it enqueues.

- `parse_jobs` table: `id`, `user_id`, `kind` (`url` | `screenshot` | `video` |
  `shopping_list` | `receipt`), `source_url`, `storage_path`, `status`
  (`pending` | `processing` | `done` | `error`), `attempts`, `error`, `result_recipe_id`,
  `created_at`, `updated_at`.
- Import UI: instead of calling the parse route, upload any image to `imports/` and insert a
  `parse_jobs` row. Show a **queue view** (pending / processing / done / error) and surface
  the finished recipe when `result_recipe_id` lands.
- **Acceptance:** adding a URL or photo creates exactly one `pending` job + (for images) one
  Storage object; nothing is parsed yet; the queue view reflects status.

## Phase 4 — Containerized local worker (cron-driven, cloud-portable)

**Goal:** one Docker artifact that drains the queue, runnable by cron now and in the cloud later.

- New module `backend/src/allaroundfood/worker.py`, entry `python -m allaroundfood.worker`:
  - `--once` (default for cron): claim all `pending` jobs (set `processing` with a guard so
    concurrent runs don't double-process), parse each, write results, set `done`/`error`,
    then exit. `--watch` optional for a long-running poll loop.
  - Per job: download Storage media if needed → run the existing parser for that `kind`
    (consolidate the screenshot/URL Claude parse — today in `frontend/lib/claude.ts` — into
    Python so the worker is the single parsing process) → insert the `Recipe` into Supabase →
    optionally run the eval pipeline → mark the job.
  - Reuses `video_import.py`, `ocr/`, `transcription.py`, pricing modules, `models.Recipe`.
  - Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY_PARSING`,
    `QWEN_GGUF_PATH`, `WHISPER_MODEL`, `FFMPEG_BIN`, `YTDLP_BIN` (see `backend/.env.example`).
- **Dockerfile** `backend/Dockerfile.worker`: base python:3.12-slim → `apt-get install ffmpeg`
  → `uv sync` → app. Models (Qwen GGUF, whisper) **mounted as a volume** locally (keeps the
  image small); for cloud, either bake them in or pull from object storage on start.
- **Local trigger:** **once a day** via cron / launchd, e.g.
  `0 8 * * *  docker run --rm --env-file backend/.env -v $MODELS:/models allaroundfood-worker --once`.
  Pick a time the machine is awake; on macOS prefer **launchd** `StartCalendarInterval`
  over `cron` so a run missed while asleep fires on next wake. A manual
  `docker run ... --once` does an on-demand drain any time.
- **Cloud-portable later (no code change):** same image as a **daily ECS Scheduled Task**
  (EventBridge cron `0 8 * * *`) / Fly scheduled machine / VM cron; only env + model-source differ.
- **Acceptance:** with jobs queued, one `--once` run parses them, recipes appear in the PWA,
  jobs flip to `done`; a forced failure flips to `error` with a message and is retryable.

## Phase 5 — Pricing + evals migration specifics

- **Pricing:** move `pricing/store/*` reads/writes to Postgres; store
  `canonical_products.embedding` as `vector(384)` and do similarity match via `pgvector`
  (`<=>`) instead of in-process cosine. Adapters + analytics run inside the worker;
  ingestion writes `price_observations` to Supabase. Pricing scope/kill-switch (ADR 0003)
  unchanged. (This closes polish-roadmap P2 — Track A, now data-backed.)
- **Evals:** the worker writes `evaluations` rows after a parse; the `/evaluations`
  dashboard reads them from Supabase.
- **Acceptance:** a basket compare returns ranked store totals from Supabase data; the evals
  dashboard renders Supabase-backed rows.

## Phase 6 — Cutover, cleanup, docs

- Remove `BACKEND_URL` proxying and the always-on FastAPI server assumption; keep an
  optional local API only if useful for dev.
- Remove the now-dead inline parse routes + `frontend/lib/claude.ts` (logic moved to worker);
  drop dead `parseVideoUrl()` (polish-roadmap P1.4).
- **Docs:** update `CLAUDE.md`/`AGENTS.md` §7–§8 + project map, `README`,
  `docs/architecture.md`; mark ADR 0001 (infra) and ADR 0005 (storage) superseded by 0007;
  add a short "superseded by personal-supabase-pivot" note atop `polish-roadmap.md`.
- Commit the existing dirty tree first (18 modified + untracked plan/.env.example/test),
  then land this work in stages on `dev`.
- **Acceptance:** docs describe the real (Supabase + worker) architecture; no references to
  a hosted backend or nonexistent deploy workflows.

---

## Cost summary

| Item | Cost |
|---|---|
| Vercel (PWA, hobby) | $0 |
| Supabase (free tier: 500 MB DB, 1 GB storage, 50k MAU) | $0 (Pro $25/mo only if you want no idle-pause) |
| Anthropic parsing | pay-per-use, run locally (as today) |
| Local worker compute | $0 (your machine) |
| Apple Developer | $0 (PWA, no App Store) |

## Open questions

1. **Sign-in method:** magic-link (simplest, no passwords) vs email+password. Recommend magic-link.
2. **Keep-alive:** which weekly Supabase keep-alive to use (GitHub Action vs UptimeRobot).
   (Worker cadence is decided: **once a day**.)
3. **Model delivery for the eventual cloud worker:** bake weights into the image vs pull from
   object storage on start. (Local uses a mounted volume regardless.)

## Suggested sequencing

```
Phase 1 (Supabase) ─► Phase 2 (PWA+auth) ─► Phase 3 (queue) ─► Phase 4 (worker)
                                                                    │
                                          Phase 5 (pricing/evals) ──┘ ─► Phase 6 (cutover/docs)
```

Phases 1–4 deliver the core loop (phone access + queued import + local parsing). Phase 5
re-homes pricing/evals; Phase 6 retires the old hosted-backend path and squares the docs.
