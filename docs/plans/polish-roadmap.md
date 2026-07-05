# Plan: Polish Roadmap — close the gap to a "working" project

> Superseded by [`personal-supabase-pivot.md`](./personal-supabase-pivot.md) and
> [`supabase-cutover.md`](./supabase-cutover.md). Keep this file as historical
> context for the hosted-backend roadmap it replaced.

**Status:** Proposed
**Date:** 2026-06-29
**Owner:** Tanner
**Branch convention:** all PRs target `dev`; `dev` → `main` is a release.

## Purpose

`CLAUDE.md §2` defines when this project is "working." Most of it is already met —
the features are built (Phases A–C) and the static checks have been green. What remains is
**deployment, runnability, pricing visibility, and end-to-end test coverage**. This doc is
the single roadmap to close those gaps, in priority order, with concrete files and
acceptance criteria per task.

## What already passes (baseline, do not redo)

- Frontend `eslint` clean; `tsc --noEmit` clean.
- No `__PLACEHOLDER__` tokens remain.
- `CLAUDE.md` == `AGENTS.md` (CI enforces it).
- Features complete: import flow, cookbook list + detail, cook mode, edit, evals
  dashboard, pantry, text shopping list. 41 backend test files; frontend unit tests present.
- Core app data exists in `data/` (recipes, meal_plans, evaluations, shopping_list,
  pantry parquet). **Only pricing data is missing** under `data/pricing/` (see P2).

> Note: backend `ruff`/`mypy`/`pytest` and frontend `vitest`/`build` could not be
> re-run in the authoring sandbox (platform-specific binaries + no PyPI access). They
> pass in CI; treat CI as the source of truth.

## Working-state gap matrix

| `CLAUDE.md §2` criterion | Status | Addressed in |
|---|---|---|
| Visual shell matches design | ✅ (desktop); mobile is desktop-first | P3 |
| Polars stub reads/writes `data/recipes.parquet` | ✅ | — |
| `pnpm lint && pnpm build` green | ✅ lint; build via CI | — |
| `uv run ruff && mypy && pytest` green | ✅ via CI | — |
| CI green on `dev` | ✅ | — |
| No `__PLACEHOLDER__` tokens | ✅ | — |
| `dev` deploys to staging without error | ❌ **no deploy exists** | **P0** |

## Ponytail review notes

Verified against the repo on 2026-06-29:

1. **Deploy docs are still not reconciled.** `CLAUDE.md`, `AGENTS.md`, and `README.md`
   reference deploy workflows that do not exist (`deploy-ec2.yml`, `deploy-vercel.yml`);
   only `.github/workflows/ci.yml` exists today. Fix this before adding deploy code.
2. **`backend/.env.example` exists in the dirty tree** and documents backend env vars
   (`config.py` + `video_import.py` + `__main__.py`). Keep it, then cross-link it from
   `README`.
3. **Stack docs drifted.** Docs still say Next.js 15 and "FastAPI planned"; the repo is
   on Next `16.2.6`, React `19.2.4`, and already has FastAPI routes.
4. **Pricing data path is `data/pricing/`, not root `data/*.parquet`.** Keep docs and
   acceptance checks pointed at the real store paths.

---

## P0 — Deploy story (the only failing working-state criterion)

**Goal:** a push to `dev` reaches a reachable staging environment; `main` reaches prod.

### P0.0 Docs truth pass
- Update `CLAUDE.md` and `AGENTS.md` together, plus `README.md`, so deploy references match
  the real mechanism chosen below.
- Update stale stack docs (`README.md`, `CLAUDE.md`, `AGENTS.md`, `frontend/context.md`,
  `backend/context.md`, `docs/architecture.md`, ADR 0001) to match Next 16 / React 19 /
  FastAPI-present reality.
- Remove the stale `whispr` port-collision comment from `backend/src/allaroundfood/__main__.py`.
- **Acceptance:** `rg "deploy-ec2|deploy-vercel|Next.js 15|FastAPI planned|whispr" README.md CLAUDE.md AGENTS.md frontend/context.md backend/context.md docs/architecture.md docs/decisions/0001-stack.md backend/src/allaroundfood/__main__.py`
  returns nothing.

### P0.1 Frontend → Vercel
- Confirm/​create the Vercel project linked to this repo; set `dev` as the staging
  environment and `main` as production (Vercel Git integration; no workflow file needed).
- Configure Vercel env vars: `ANTHROPIC_API_KEY_PARSING`, `BACKEND_URL` (point at the
  P0.2 backend URL, **not** localhost).
- **Acceptance:** push to `dev` yields a Vercel preview/staging URL that renders the app.

### P0.2 Backend → a reachable host
- Pick a host for the FastAPI/uvicorn app (`python -m allaroundfood`, binds `0.0.0.0:8000`).
  Candidates: Fly.io, Railway, Render, or a small VM. Constraint: the image must carry
  `ffmpeg` + `yt-dlp` and (optionally) the whisper.cpp + Qwen GGUF weights, so prefer a
  container host over serverless.
- Do the two tiny production-readiness fixes before first deploy: make CORS allow the Vercel
  staging/prod origins, and avoid `reload=True` in production.
- Decide where the file-backed `data/` directory lives in staging/prod (persistent volume or
  explicitly disposable staging data). A container filesystem alone loses recipes on restart.
- Write a `Dockerfile` for `backend/` (system deps: `ffmpeg`; pip/uv deps from
  `pyproject.toml`; pre-fetch whisper `base.en` GGML — see P1.3).
- Set backend env from `backend/.env.example` (Kroger creds optional;
  `DISABLE_UNOFFICIAL_INGESTION` as desired).
- **Acceptance:** backend health route reachable over HTTPS; `BACKEND_URL` in Vercel
  points at it; a recipe round-trips through the deployed stack.

### P0.3 Deploy automation + docs
- Either rely on Vercel Git integration (frontend) + host-native deploy (backend), or add
  `.github/workflows/deploy-*.yml`. Whichever is chosen, the file must actually exist and
  the three docs (`CLAUDE.md §3/§7`, `README`) must match it.
- Update `TODO.md` Phase D: check off "Deploy backend somewhere reachable from Vercel."
- **Acceptance:** `docs` describe the real mechanism; no references to nonexistent files.

---

## P1 — Make the backend runnable end-to-end

**Goal:** every parse/import path works off-box, not just on a dev laptop.

### P1.1 Provision the parsing key
- `ANTHROPIC_API_KEY_PARSING` must be set wherever the Next.js API layer runs (local
  `.env.local`, Vercel, CI for E2E). Without it all Claude parsing fails.
- **Acceptance:** import-by-URL and screenshot parse succeed in staging.

### P1.2 Env documentation (✅ partially done)
- `frontend/.env.local.example` already exists; `backend/.env.example` added in this pass.
- Cross-link both from `README` "Getting started."
- **Acceptance:** a fresh clone can populate env from the two example files alone.

### P1.3 System deps + model prefetch (video import)
- Document + install `ffmpeg` and `yt-dlp` for dev and in the P0.2 image (`ffmpeg` is not
  a pip package). Vars: `FFMPEG_BIN`, `YTDLP_BIN`.
- Pre-fetch the whisper `base.en` GGML model during provisioning; set `WHISPER_MODEL` /
  `WHISPER_MODELS_DIR`.
- **Acceptance:** a video URL imports end-to-end in staging within `VIDEO_IMPORT_TIMEOUT_S`.

### P1.4 Frontend dead-code cleanup
- Keep `isVideoRecipeUrl()` (used by `DropZone`); remove or route through the apparently
  dead `parseVideoUrl()` in `frontend/src/lib/api.ts`.
- **Acceptance:** no unreferenced exports; lint/tsc still clean.

---

## P2 — Pricing: data or gate

**Problem:** no pricing parquet exists (`data/pricing/price_observations.parquet`,
`data/pricing/canonical_products.parquet`, `data/pricing/store_locations.parquet`,
`data/pricing/retailer_skus.parquet`), so basket comparison returns nothing. Pick ONE track.

### Track A — Ship it with real data (heavier)
- Validate ≥1 adapter end-to-end against live data — start with **Kroger official API**
  (needs `KROGER_CLIENT_ID/SECRET`).
- Implement the Playwright fallbacks currently raising `NotImplementedError`
  (walmart / costco / whole_foods / instacart locations + search).
- Costco: confirm promo field + membership flag; Instacart: `source_retailer` tagging;
  Costco ZIP→geocoding in `pricing/locations/resolver.py`.
- Seed/ingest a first batch of `PriceObservation` rows so `/prices` and basket compare
  return data.
- Wire shopping list → `POST /pricing/basket`: map items to canonical product IDs,
  add "Compare across stores" button + ZIP selector on `/shop`, render cheapest-store total.
- Add a Costco adapter test + a shopping→basket integration test.
- `/prices` page: loading + error states.

### Track B — Gate it cleanly (lighter, recommended for first polish pass)
- Hide `/prices` and basket-compare entry points behind a feature flag
  (default off) until Track A data exists, so nothing ships visibly broken.
- Use one flag (`NEXT_PUBLIC_ENABLE_PRICING=true`) and gate both the `/prices` page and the
  mobile tab. Do not build shopping-list basket UI in this track.
- Keep the backend code + tests; only the UI surface is gated.
- **Acceptance (either track):** no user-facing path returns an empty/broken pricing result.

> Decision needed — see "Open decisions" below.

---

## P3 — Testing, QA, and feature completion

### P3.1 Real E2E (extend the existing Playwright setup)
- Implement the Playwright import-flow test end-to-end in a browser
  (`frontend/e2e/`), using `ANTHROPIC_API_KEY_PARSING` (or a mocked parse) in CI.
- Keep the existing mocked `/prices` Playwright flow; add an E2E job to
  `.github/workflows/ci.yml` (or a nightly workflow) so `pnpm test:e2e` actually runs.
- **Acceptance:** import flow is exercised in CI, not just unit-mocked.

### P3.2 Shopping-list upload feature (not yet built)
- Not a release blocker. Defer unless P0/P1/P2 Track B are already done.
- Frontend: `ShoppingListParseSchema` + Claude tool & `parseShoppingListFromImage()` in
  `lib/claude.ts`; `/api/shopping-list/parse` route + `parseShoppingList()` /
  `importShoppingListItems()` in `lib/api.ts`; `ShoppingListImportFlow` component +
  upload entry on `/shop`; extend `DropZone` with a `"shopping-list"` variant.
- Backend: `POST /shopping-list/parse` bulk-add endpoint → `shopping_storage`
  (mirror `/pantry/receipt-import`).
- Tests for the parse schema + endpoint.
- **Acceptance:** a photo of a list imports as structured shopping items.

### P3.3 Mobile responsive pass
- Current layout is desktop-first; do a responsive pass per the design shell.
- **Acceptance:** detail / cook / edit / shop usable at mobile widths.

---

## P4 — Release hygiene

- **Commit the dirty tree on `dev`** after the current doc/config/test changes are reviewed.
  Don't bypass the husky hook.
- **Clean up completed TODOs.** `TODO.md` still has many `- [x]` Phase A-C lines; promote
  or archive them so only open work remains.
- **Release `dev` → `main`** when P0–P1 land (`dev` is currently 11 commits ahead of
  `main`; nothing has shipped to prod).
- **ADR upkeep:** `0006-local-whispercpp-transcription.md` already supersedes the whispr
  approach in `0002` — verify `0002` is marked superseded and cross-links `0006`
  (the code change already landed per CHANGELOG).
- Promote completed `TODO.md` lines via `scripts/done.py` as each phase ships.

---

## Open decisions

1. **Backend host (P0.2):** container host (Fly/Railway/Render/VM)? Recommendation:
   Fly.io or Railway — both carry custom Docker images with `ffmpeg`.
2. **Pricing (P2): Track A (ship with data) vs Track B (gate behind flag).**
   Recommendation: **Track B now**, Track A as a follow-up — it unblocks a clean release
   without depending on live retailer data.
3. **E2E parsing in CI (P3.1):** real `ANTHROPIC_API_KEY_PARSING` (costs tokens, flakier)
   vs mocked parse. Recommendation: mocked parse for PR CI, real key for a nightly run.

## Suggested sequencing

```
P0.0 docs truth ──► P2 Track B gate ──► P0/P1 deploy+runnable ──► P4 release dev→main
                                                                └─► P3.1 E2E in CI

P3.2 / P3.3 happen after the release blockers unless capacity is idle.
```

P0.0, P2 Track B, and P0/P1 are the shortest path to a real staging deploy and the first
honest `dev → main` release. P3 raises the polish ceiling after that.
