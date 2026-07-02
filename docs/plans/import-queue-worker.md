# Plan: Import → Parse Queue (Phase 3) + Local Worker (Phase 4)

**Status:** Proposed
**Date:** 2026-07-01
**Owner:** Tanner
**Parent plan:** [`personal-supabase-pivot.md`](./personal-supabase-pivot.md) — this fleshes out Phases 3 & 4.
**Decision record:** [ADR 0007](../decisions/0007-personal-supabase-rearchitecture.md)

## Scope of this plan

The two "core loop" phases of the Supabase pivot, in detail:

- **Phase 3 — Import becomes a queue.** The PWA stops parsing inline. Instead it
  uploads any source media to the `imports` Storage bucket and inserts one
  `parse_jobs` row (`status='pending'`). A queue view shows status and surfaces
  the finished recipe when `result_recipe_id` lands.
- **Phase 4 — Containerized local worker.** One Docker image with a
  `worker --once` entry point drains `parse_jobs`: download media → run the parser
  for that `kind` → write the result to Supabase → mark the job `done`/`error`.
  Cron/launchd-driven locally today; re-hostable as a scheduled cloud container
  later with no code change.

**Decisions taken for this plan (2026-07-01):**

1. The worker handles **all five `kind`s**: `url`, `screenshot`, `video`,
   `shopping_list`, `receipt`.
2. The eval/judge pipeline (LLM-as-judge grading → `evaluations` rows) **is
   ported into the worker in Phase 4**, behind a `RUN_EVALS` env toggle. It runs
   fire-and-forget after a recipe parse so it never blocks or fails a job. This
   keeps the `/evaluations` dashboard alive across cutover; flip `RUN_EVALS=false`
   to defer it to Phase 5 instead.

---

## What already exists (Phases 1–2)

Grounding the plan in the current tree so we build on what's there, not next to it.

**Database (Phase 3's DB half is already done):**

- `supabase/migrations/0001_init.sql` already declares the **`parse_jobs`** table:
  `id text default gen_random_uuid()::text`, `user_id uuid default auth.uid()`,
  `kind` check (`url | screenshot | video | shopping_list | receipt`),
  `source_url`, `storage_path`, `status` check (`pending | processing | done |
  error`) default `pending`, `attempts int default 0`, `error`,
  `result_recipe_id text references recipes`, `created_at`, `updated_at`.
  Indexes on `status` and `result_recipe_id`; RLS `owner` policy
  (`user_id = auth.uid()`).
- `supabase/migrations/0002_storage.sql` already creates the private **`imports`**
  bucket + owner-only RLS on `storage.objects` (`owner = auth.uid()` for
  select/insert/update/delete scoped to `bucket_id = 'imports'`).
- All app tables (`recipes`, `receipts`, `shopping_list_items`, `evaluations`,
  pricing, …) exist and mirror the Polars `*Store` columns.

> Net: **no new schema is required to enqueue.** Phase 3 is a frontend rewire.
> Phase 4 adds one small migration (`0003`) for an atomic-claim RPC + a
> `payload_text` column for pasted-text kinds (see below).

**Frontend (Phase 2 groundwork):**

- Supabase clients: `frontend/src/lib/supabase/{server,client,middleware}.ts`
  (SSR cookie-bound anon client — RLS-scoped, never service-role).
- Auth: `login/page.tsx`, `auth/confirm/route.ts`, `auth/signout/route.ts`,
  `middleware.ts`.
- Server-only data layer example: `frontend/src/lib/db/recipes.ts` (the pattern
  to mirror for a new `parseJobs` module).

**Current import flow (the thing Phase 3 replaces):**

- `frontend/src/app/(app)/import/ImportFlow.tsx` — client component;
  `handleImage` / `handleUrl` / `handleVideoUrl` POST to `/api/import/parse`, get a
  `Recipe` back **inline**, show `RecipeReview`, then `handleSave` POSTs to
  `/api/recipes`.
- `frontend/src/app/api/import/parse/route.ts` — discriminated union
  (`image | url | video_url`); calls `lib/claude.ts`; video path calls the FastAPI
  backend `/recipes/parse-video` via `BACKEND_URL`; fire-and-forget grades via
  `gradeRecipeParse` → POSTs an `evaluation` to the backend.
- `frontend/src/lib/claude.ts` — the parsing brains to port:
  `parseRecipeFromImage`, `parseRecipeFromUrl`, `parseRecipeFromVideoText`,
  `parseReceiptFromImage`, `gradeRecipeParse`, `sha256Hex`. Worker model
  `claude-haiku-4-5`; judge model `claude-sonnet-4-6`; forced `tool_choice`;
  system prompts `WORKER_SYSTEM_BASE` (+ URL/VIDEO variants).

**Backend parsers already in Python (the worker reuses these directly):**

- `backend/src/allaroundfood/video_import.py` — `async fetch_video_text(...) ->
  VideoImportResult` (caption + transcript via yt-dlp/ffmpeg/whisper.cpp);
  `validate_video_url()`, `check_video_import_binaries()`.
- `backend/src/allaroundfood/ocr/parser.py` — `ReceiptParser.parse(preprocessed)
  -> Receipt` (Qwen2-VL GGUF).
- `backend/src/allaroundfood/transcription.py` — whisper.cpp wrapper.
- `backend/src/allaroundfood/models.py` — `Recipe`, `VideoImportResult`,
  `Receipt`, `ShoppingListItem`, etc. `Recipe` maps 1:1 to the `recipes` columns
  (list/nutrition fields → jsonb).
- `backend/scripts/migrate_parquet_to_supabase.py` — the **service-role
  supabase-py pattern** to reuse (upsert `on_conflict="id"`, JSON columns,
  `OWNER_USER_ID` stamping). `supabase>=2.0` is already a `migrate` dep-group entry.

---

## Phase 3 — Import becomes a queue

**Goal:** importing never parses inline; it enqueues exactly one `pending` job
(+ one Storage object for image kinds); a queue view reflects status and links the
finished recipe when `result_recipe_id` is set.

### 3.1 Data-access module — `frontend/src/lib/db/parseJobs.ts`

Client-safe helpers using the **browser** Supabase client (so RLS + storage
`owner` bind to the signed-in user). Mirrors the shape of `lib/db/recipes.ts`.

- `enqueueUrlJob(url)` → decide `kind`: `video` if the host matches the existing
  `VIDEO_URL_HOST_RE` (tiktok/instagram), else `url`. Insert
  `{ kind, source_url: url }`. Return the new row.
- `enqueueImageJob(file, kind)` for `kind ∈ {screenshot, receipt}` (and a
  shopping-list *photo*): upload to `imports/${userId}/${uuid}.${ext}` via
  `supabase.storage.from('imports').upload(path, file)`, then insert
  `{ kind, storage_path: path }`.
- `enqueueTextJob(text, kind)` for pasted **`shopping_list`** text: insert
  `{ kind: 'shopping_list', payload_text: text }` (new nullable column — see 3.4).
- `listJobs()` / `subscribeJobs(cb)` — select `parse_jobs` ordered
  `created_at desc`; subscribe via Supabase Realtime (fallback: poll every ~4s).

`user_id`, `status='pending'`, `attempts=0`, timestamps all default server-side —
the client sends only `kind` + `source_url` / `storage_path` / `payload_text`.

### 3.2 Rewire `ImportFlow.tsx`

Replace the inline parse→review→save state machine with enqueue→confirm:

- `handleImage` / `handleUrl` / `handleVideoUrl` call the `enqueue*` helpers
  instead of `POST /api/import/parse`. On success show a lightweight "Added to the
  queue — your recipe will appear shortly" confirmation.
- Drop the inline `RecipeReview` / `SavedConfirmation` save path from the import
  screen. The **worker** creates the recipe; the user edits it afterward via the
  existing `cookbook/[id]/edit` page. (Removing `RecipeReview` entirely is a
  Phase 6 cleanup — leave the component in place for now.)
- `DropZone` currently yields `base64 + mediaType`; add a path that also surfaces
  the raw `File`/`Blob` for the Storage upload (or convert base64 → `Blob`). Keep
  the existing allowed types: `image/jpeg | image/png | image/webp`.

### 3.3 Queue view — `frontend/src/app/(app)/import/ImportQueue.tsx`

- Renders the user's jobs newest-first with a status badge
  (`pending | processing | done | error`), the `kind`, the source (URL or file
  name), the `error` text when failed, and a **"View recipe"** link to
  `cookbook/${result_recipe_id}` once `done`.
- Live updates via `subscribeJobs`.
- A **Retry** action on `error` rows: reset `status='pending'`, `error=null`
  (attempts left intact so the poison-guard in 4.4 still applies).
- `import/page.tsx` renders the enqueue form (`ImportFlow`) **and** `ImportQueue`.

### 3.4 One tiny schema add — `payload_text` (migration `0003`)

`parse_jobs` only has `source_url` + `storage_path`. Pasted **shopping-list text**
has no home. Add `payload_text text` (nullable) to `parse_jobs` in
`supabase/migrations/0003_*.sql` (bundled with the Phase 4 claim RPC). Shopping-list
*photos* still use `storage_path`; only pasted text uses `payload_text`.

### 3.5 Stop calling the inline route (don't delete yet)

Phase 3 makes the UI stop hitting `/api/import/parse`. Leave the route +
`lib/claude.ts` in the tree until the worker is proven (deleted in Phase 6). If
Phase 3 ships before Phase 4, imports correctly queue but nothing drains them until
the worker runs — that is the expected "import is no longer instant" behavior.

### 3.6 Acceptance & tests

- **Acceptance (from pivot doc):** adding a URL or photo creates **exactly one**
  `pending` job + (for images) **one** Storage object; nothing is parsed yet; the
  queue view reflects status and links the recipe when it lands.
- Unit: `enqueue*` build the right row + `imports/${userId}/…` path; URL→kind
  classification (video vs url).
- Component: `ImportQueue` renders each status + the retry action + the recipe link.
- Manual: sign in on phone/web, submit a URL and a screenshot, confirm one row
  each + one storage object, watch statuses update live.

---

## Phase 4 — Containerized local worker (cron-driven, cloud-portable)

**Goal:** one Docker artifact, entry `python -m allaroundfood.worker --once`, that
claims all pending jobs, parses each by `kind`, writes results to Supabase, marks
`done`/`error`, then exits.

### 4.1 Dependencies & config

- `backend/pyproject.toml`: promote `supabase>=2.0` from the `migrate` group into
  main deps; add `anthropic>=0.40` (Python SDK — the worker becomes the single
  Claude-parsing process). torch / llama-cpp-python / pywhispercpp / yt-dlp are
  already deps.
- `backend/src/allaroundfood/config.py`: extend `Settings` with
  `supabase_url: str`, `supabase_service_role_key: SecretStr`,
  `anthropic_api_key_parsing: SecretStr`, `run_evals: bool = True`,
  `whisper_model`, `whisper_models_dir`, `ffmpeg_bin`/`ytdlp_bin` (some already read
  directly in `video_import.py` — consolidate onto Settings), `worker_max_attempts:
  int = 3`. `qwen_gguf_path` already exists.
- `backend/.env.example`: add the Supabase + Anthropic keys with a note that the
  Anthropic key **moves out of Vercel/frontend into the worker** (ADR 0007 §3).

### 4.2 Supabase access layer — `backend/src/allaroundfood/supabase_client.py`

Service-role client (bypasses RLS) built from `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, reusing the `migrate_parquet_to_supabase.py` idiom.
Thin helpers the worker calls:

- `claim_pending_jobs(limit)` — see 4.4 (RPC).
- `mark_processing/mark_done/mark_error(job_id, …)` — set `status`, `error`,
  `result_recipe_id`, bump `updated_at`.
- `insert_recipe(recipe)` — upsert into `recipes` (assign UUID `id`, stamp
  `user_id` from the job's owner, `created_at`, `times_made=0`).
- `download_import(storage_path) -> bytes` —
  `storage.from_('imports').download(path)`.
- `insert_receipt(...)`, `insert_shopping_items(...)`, `insert_evaluation(...)`.

Every write stamps `user_id` from the **job's** `user_id` (service-role has no
`auth.uid()`), exactly like the migration script's `OWNER_USER_ID`.

### 4.3 Port the parsers TS → Python — `backend/src/allaroundfood/parsing/`

Port `frontend/lib/claude.ts` into Python so the worker is the single parse path.
Build the Anthropic tool schema from pydantic (`Recipe.model_json_schema()`), copy
the system prompts **verbatim**, force `tool_choice`, and validate the tool output
back into `models.Recipe`.

- `recipe_parser.py`:
  - `parse_recipe_from_image(data: bytes, media_type)` → Haiku, `extract_recipe`
    tool.
  - `parse_recipe_from_url(url)` → fetch (10s timeout) + strip
    scripts/styles/tags, cap 30k chars (port the regex chain) → Haiku.
  - `parse_recipe_from_video_text(caption, transcript, url)` → Haiku (VIDEO
    prompt variant).
- Receipt: **reuse the existing Python `ocr.parser.ReceiptParser` (Qwen)** rather
  than re-porting the Claude `parseReceiptFromImage`. It already writes the
  `receipts` shape and matches the pricing ADRs. (The Claude receipt path can be a
  fallback if `QWEN_GGUF_PATH` is unset — decide at build time.)
- Video: reuse `video_import.fetch_video_text()` (already Python) → feed into
  `parse_recipe_from_video_text`.
- Shopping list: parse `payload_text` (or a downloaded image) into
  `ShoppingListItem` rows. Reuse the design in
  `docs/superpowers/specs/2026-06-07-text-shopping-list-design.md` +
  `shopping_logic.py`; a small Haiku call for messy text, deterministic split for
  clean lists.

### 4.4 Atomic claim (migration `0003`) — no double-processing

The pivot doc requires a guard so concurrent runs don't double-process. Add a
Postgres function in `supabase/migrations/0003_*.sql`:

```sql
create or replace function public.claim_parse_jobs(p_limit int)
returns setof public.parse_jobs
language sql as $$
  update public.parse_jobs j
     set status = 'processing', attempts = attempts + 1, updated_at = now()
   where j.id in (
     select id from public.parse_jobs
      where status = 'pending' and attempts < 3   -- poison-job guard
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
$$;
```

Worker calls `supabase.rpc('claim_parse_jobs', {'p_limit': n})`. `for update skip
locked` makes concurrent `--once` runs safe even though cron runs it once/day.
(Same migration adds `payload_text` from 3.4.)

### 4.5 Worker entry — `backend/src/allaroundfood/worker.py`

- `python -m allaroundfood.worker` with argparse:
  `--once` (default; claim → drain → exit), `--watch [interval]` (poll loop),
  `--limit N`, `--job-id ID` (reprocess one for debugging).
- Loop: `claim_parse_jobs(limit)` → for each job, dispatch by `kind`:

  | kind | parse | write | mark |
  |---|---|---|---|
  | `url` | `parse_recipe_from_url` | `insert_recipe` | `done` + `result_recipe_id` |
  | `video` | `fetch_video_text` → `parse_recipe_from_video_text` | `insert_recipe` | `done` + `result_recipe_id` |
  | `screenshot` | download → `parse_recipe_from_image` | `insert_recipe` | `done` + `result_recipe_id` |
  | `receipt` | download → `ReceiptParser.parse` | `insert_receipt` (+ price_observations) | `done` |
  | `shopping_list` | `payload_text`/download → shopping parser | `insert_shopping_items` | `done` |

- On success: write result, set `result_recipe_id` (recipe kinds), `status='done'`.
- On failure: catch per-job, set `status='error'`, store the message in `error`.
  A poison job stops retrying once `attempts >= worker_max_attempts` (the claim
  RPC's `attempts < 3` filter).
- **Idempotency:** if a job already has `result_recipe_id`, skip re-insert (guards
  against a reprocess after a partial write creating duplicate recipes).
- Exit code `0` even when individual jobs error (job-level errors live in the row);
  non-zero only on a fatal misconfig (missing DB creds).

### 4.6 Evals in the worker (toggle: `RUN_EVALS`)

Port `gradeRecipeParse` → `parsing/judge.py::grade_recipe_parse()` (Sonnet,
`submit_verdict` tool, `field_checks`). After a recipe parse, if `RUN_EVALS`,
call it **fire-and-forget** and `insert_evaluation(...)`. A judge failure never
fails the job. `RUN_EVALS=false` defers the whole thing to Phase 5.

### 4.7 Dockerfile — `backend/Dockerfile.worker`

Multi-stage to keep the runtime image lean despite native builds:

- **builder:** `python:3.12` → `build-essential cmake` → `uv sync --no-dev`
  (compiles `llama-cpp-python` + `pywhispercpp`).
- **runtime:** `python:3.12-slim` → `apt-get install -y ffmpeg` → copy the venv →
  `ENTRYPOINT ["python", "-m", "allaroundfood.worker"]`, `CMD ["--once"]`.
- Heavy weights (Qwen GGUF, whisper) are **volume-mounted at `/models`**, not baked
  in: env `QWEN_GGUF_PATH=/models/qwen2-vl.gguf`, `WHISPER_MODELS_DIR=/models/whisper`.
  yt-dlp is a pip dep already; `ffmpeg` is the only apt binary.

### 4.8 Local trigger — cron / launchd (`infra/worker/`)

- macOS: a **launchd** plist with `StartCalendarInterval` (fires on next wake if the
  machine was asleep — better than `cron` for a laptop). Ship a template plist +
  install notes.
- Linux/portable: crontab line, e.g.
  `0 8 * * * docker run --rm --env-file backend/.env -v $MODELS:/models allaroundfood-worker --once`.
- Manual `docker run … --once` = on-demand drain any time.

### 4.9 Cloud-portable later (no code change)

The same image runs as a daily **ECS Scheduled Task** (EventBridge cron) / Fly
scheduled machine / VM cron. Only env + model source differ (bake weights into the
image or pull from object storage on start; local keeps the mounted volume).

### 4.10 Acceptance & tests

- **Acceptance:** with jobs queued, one `--once` run parses them, recipes appear in
  the PWA, jobs flip to `done`; a forced failure flips to `error` with a message
  and is retryable from the queue view.
- Unit: each `parse_recipe_from_*` against fixtures with a **mocked Anthropic
  client** → valid `Recipe`; reuse existing parse fixtures/tests.
- Concurrency: two overlapping `claim_parse_jobs` calls never return the same row
  (integration against a throwaway/local Postgres).
- Dispatch: table-driven per `kind` with mocked parsers + a fake supabase client →
  asserts the right table write + status transition + error capture + idempotency
  skip.
- Smoke: seed one `pending` job of each kind in a scratch Supabase project, run
  `--once`, assert `done` + rows.

---

## File-touch summary

| Area | File | Change |
|---|---|---|
| DB | `supabase/migrations/0003_claim_and_payload.sql` | **new** — `claim_parse_jobs` RPC + `parse_jobs.payload_text` |
| FE | `frontend/src/lib/db/parseJobs.ts` | **new** — enqueue/list/subscribe helpers |
| FE | `frontend/src/app/(app)/import/ImportFlow.tsx` | rewrite: enqueue instead of inline parse |
| FE | `frontend/src/app/(app)/import/ImportQueue.tsx` | **new** — live queue view + retry |
| FE | `frontend/src/app/(app)/import/page.tsx` | render form + queue |
| FE | `frontend/src/components/recipe/DropZone.tsx` | also surface raw `File` for upload |
| BE | `backend/pyproject.toml` | `supabase` → main deps; add `anthropic` |
| BE | `backend/src/allaroundfood/config.py` | Supabase/Anthropic/worker settings |
| BE | `backend/.env.example` | new keys; note Anthropic key moves off Vercel |
| BE | `backend/src/allaroundfood/supabase_client.py` | **new** — service-role client + helpers |
| BE | `backend/src/allaroundfood/parsing/recipe_parser.py` | **new** — port of claude.ts recipe parsers |
| BE | `backend/src/allaroundfood/parsing/judge.py` | **new** — port of `gradeRecipeParse` |
| BE | `backend/src/allaroundfood/worker.py` | **new** — `--once` loop + dispatch |
| BE | `backend/Dockerfile.worker` | **new** — multi-stage image |
| Infra | `infra/worker/` | **new** — launchd plist + crontab template |
| Deferred to Phase 6 | `frontend/src/app/api/import/parse/route.ts`, `frontend/src/lib/claude.ts` | delete after worker proven |

## Risks & open items

- **Native builds in Docker** (`llama-cpp-python`, `pywhispercpp`) inflate build
  time/image size → multi-stage + volume-mounted weights (4.7).
- **Claim correctness** under concurrent runs → the `for update skip locked` RPC
  (4.4), not a naive select-then-update.
- **Poison jobs** → `attempts < worker_max_attempts` guard in the claim filter.
- **Idempotency** → skip re-insert when `result_recipe_id` already set (4.5).
- **Shopping-list text home** → new `payload_text` column (3.4); shopping-list
  photos still use `storage_path`.
- **Anthropic key relocation** → remove from Vercel, live only in worker `.env`.
- **Cutover ordering** → don't delete `/api/import/parse` + `claude.ts` until the
  worker is verified (Phase 6). Ship Phase 3 + 4 close together (or 4 right after
  3) so the loop is whole.
- **Migrations applied?** Confirm `0001`/`0002` are live on the Supabase project
  before `0003`.

## Suggested sequencing

```
3.4 + 4.4 migration (0003) ─┐
Phase 3 FE (enqueue+queue) ─┼─► Phase 4 BE (client → parsers → worker → Docker → cron)
                            └───────────────► verify loop end-to-end ─► Phase 6 cleanup
```

Land in small PRs on `dev`: migration `0003`; then Phase 3 FE; then the worker in
the order deps → supabase_client → parsers (+ tests) → worker loop → Dockerfile →
launchd/cron → evals. Per the repo workflow, promote each `TODO.md` line via
`scripts/done.py` when it ships, and keep `CLAUDE.md`/`AGENTS.md` in sync (the
context/doc updates land in Phase 6).
