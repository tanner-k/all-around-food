# Local-First Pivot — Server Side (Queue v2 + Slimmed Worker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Supabase into a queue + URL cache only, slim `backend/` to the parse worker, and ship the parquet→JSON recipe export — the server half of the local-first iOS pivot (spec: `docs/superpowers/specs/2026-07-13-local-first-ios-design.md`).

**Architecture:** The phone submits `parse_jobs` rows (URL or screenshot path); a cron-driven laptop worker (`worker --once`) normalizes URLs, checks the `parse_results` cache, parses on miss (yt-dlp/whisper.cpp/Claude — all existing code), writes results keyed by normalized URL, and marks jobs `done` pointing at the result. Evals move from a Supabase table to the local parquet `EvalStore`. Everything out of scope (pricing, OCR, messaging, FastAPI API, per-domain Supabase tables) is deleted from the working tree (git history retains it).

**Tech Stack:** Python 3.12 + uv, pydantic, httpx, supabase-py, Polars; Supabase Postgres migrations (plain SQL files).

**Out of scope (separate follow-up plan):** the iOS app itself (`ios/`). It consumes this plan's `parse_results.recipe` JSON contract, so this plan must land first.

## Global Constraints

- Python 3.12; run everything via `uv run` from `backend/`.
- Gate for every task: `uv run ruff check && uv run mypy src tests && uv run pytest` green (run from `backend/`).
- Job statuses are exactly `pending | running | done | failed` (spec wording — note: replaces old `processing`/`error`).
- `parse_results` PK is `normalized_url text`; the table IS the URL cache.
- The Anthropic key lives only in the worker env (`ANTHROPIC_API_KEY_PARSING`); never referenced outside `backend/`.
- URL normalization happens in the worker only; the phone always just submits jobs.
- `frontend/` is frozen: do not touch any file under `frontend/`.
- If you edit `CLAUDE.md`, make the identical edit to `AGENTS.md` in the same commit.
- Conventional commit messages (`feat:`, `docs:`, `refactor:`…). Do not use `--no-verify`.
- The new migration is a repo file only — **do not apply it to the live project**; applying is a manual Tanner step after this plan merges (see Task 2 notes).

---

### Task 1: ADR 0008 + canon docs

**Files:**
- Create: `docs/decisions/0008-local-first-ios.md`
- Modify: `CLAUDE.md` (sections 1, 2, 3, 7, 8), `AGENTS.md` (identical edits)
- Modify: `backend/context.md` (full rewrite)

**Interfaces:**
- Consumes: nothing.
- Produces: the recorded decision later tasks cite in commit messages/comments (`ADR 0008`).

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0008-local-first-ios.md`:

```markdown
# 0008 — Local-first iOS app; Supabase demoted to parse queue + URL cache

**Status:** Accepted
**Date:** 2026-07-14
**Supersedes:** the PWA and Supabase-as-system-of-record parts of ADR 0007.
The containerized local parse worker from ADR 0007 is retained (video + all parsing).
**Spec:** docs/superpowers/specs/2026-07-13-local-first-ios-design.md

## Context

ADR 0007 made Supabase the system of record with a PWA frontend. Tanner's
iPhone predates Apple Intelligence (no on-device Foundation Models), the app
is personal-use only, and daily-use features should work fully offline.

## Decision

1. **Native iOS app** (`ios/`, SwiftUI + SwiftData, iOS 17+, sideload/TestFlight).
   All daily-use data — recipes, meal plans, pantry, shopping list — lives
   on-device in SwiftData. The Recipe model is a Swift port of the Pydantic
   schema so worker output decodes directly.
2. **Queue everything.** All imports (URL, screenshot, video) are parsed by the
   laptop worker via a Supabase queue. The worker returns a finished recipe
   JSON (full parse, not transcribe-only).
3. **Supabase holds only** `parse_jobs` (queue), `parse_results` (URL cache,
   keyed by normalized source URL), and the screenshot Storage bucket. RLS on;
   single user. No meal plans, pantry, or shopping data server-side.
4. **URL normalization in the worker**, never the phone. On a cache hit the
   worker marks the job done immediately, pointing at the cached recipe — one
   code path; the cache is invisible to the app.
5. **Repo layout:** iOS app in `ios/`. `frontend/` frozen (stays in git, no new
   work). `backend/` slimmed to the worker.
6. **Dropped from scope:** grocery pricing, store price comparison, Kroger
   export, receipt OCR. Code remains in git history; working tree deleted.
7. **Evals stay laptop-side**, written to the local parquet EvalStore instead
   of a Supabase table.

## Consequences

- (positive) Fully offline daily use; zero server-side app data; Anthropic key
  never leaves the worker env.
- (positive) Parsing stays one engine (existing prompts, whisper.cpp, yt-dlp,
  eval pipeline); on-device Foundation Models are a future additive path.
- (tradeoff) Imports resolve only when the laptop worker runs (cron every
  10–15 min while awake); the app polls open jobs when foregrounded.
- (tradeoff) `frontend/` and the Supabase per-domain tables are abandoned;
  migration is a one-off parquet→JSON export imported on the app's first run.
- (followup) ADRs 0003/0004/0005 (pricing) are moot for v1; revisit only if
  pricing returns.
```

- [ ] **Step 2: Update `CLAUDE.md` (and `AGENTS.md` identically)**

Apply these edits to both files:

1. §1 What this project is — replace the paragraph body with:
   `A planner-first cooking app, now a local-first native iOS app — weekly meal planning, AI recipe import via a laptop parse worker, smart shopping list, pantry inventory, and a hands-on cook mode. See ADR 0008.`
2. §2 Working state — replace the bullet list with:
   ```markdown
   - `cd backend && uv run ruff check && uv run mypy src tests && uv run pytest` green
   - CI green on dev branch
   - `frontend/` is frozen: it stays in git but gets no new work
   - No remaining `__PLACEHOLDER__` tokens
   ```
3. §3 Project map — in the tree, change the `frontend/` line to
   `├── frontend/              ← FROZEN (ADR 0008) — no new work`, change the
   `backend/` comment to `← laptop parse worker · see context.md`, remove the
   `pricing/` and `ocr/` sub-entries, add
   `├── ios/                   ← native iOS app (planned — ADR 0008)` after
   `frontend/`, and add `0008-local-first-ios.md` to the decisions list.
4. §4 Where to do what — change the `frontend/` row's "Go to" to
   `frozen — do not modify`, and add a row: `| iOS feature | ios/ | ADR 0008 |`.
5. §7 Deploy — replace the section body with:
   ```markdown
   No cloud deploy. The iOS app sideloads via Xcode/TestFlight. The parse
   worker runs on the laptop via cron (`worker --once`, every 10–15 min while
   awake). Supabase hosts only the parse queue + URL cache (ADR 0008).
   ```
6. §8 Tech stack — replace with:
   ```markdown
   - iOS app: Swift + SwiftUI + SwiftData (iOS 17+), supabase-swift
   - Worker: Python 3.12 + Polars + whisper.cpp + yt-dlp + Anthropic SDK
   - Queue/cache: Supabase (Postgres + Storage), RLS on
   - Frontend (frozen): Next.js 16 + React 19 + Tailwind v4
   - Package manager: pnpm (frontend, frozen) / uv (backend)
   ```

- [ ] **Step 3: Rewrite `backend/context.md`**

```markdown
# backend/

## Scope
The laptop parse worker (ADR 0008): drains the Supabase `parse_jobs` queue,
parses recipes (URL / screenshot / video), writes `parse_results` (the URL
cache), and grades parses into the local eval store.

## Not in scope
- UI → `ios/` (native app) · `frontend/` is frozen
- Queue/cache schema → `supabase/migrations/`

## Stack
Python 3.12 + uv · pydantic · httpx · supabase-py · Polars (local eval store)

## Runtime requirements
- `yt-dlp` + `ffmpeg` for video fetch/audio extraction
- whisper.cpp in-process via `pywhispercpp` (ADR 0006). `WHISPER_MODEL`
  (default `base.en`); `WHISPER_MODELS_DIR` for pre-downloaded ggml models.
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY_PARSING`

## Run
```bash
cd backend
uv run python -m allaroundfood.worker --once   # cron entry point
```

## Notes for agents
- All shared env access goes through `config.py` — fail loudly if missing.
- URL normalization (`url_normalize.py`) happens here, never on the phone.
- One bad job never aborts a drain; failures land on the job row (`failed`).
- Evals are fire-and-forget into `data/evaluations.parquet` (local EvalStore).
```

- [ ] **Step 4: Verify canon files match**

Run: `diff CLAUDE.md AGENTS.md && echo IDENTICAL`
Expected: `IDENTICAL`

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0008-local-first-ios.md CLAUDE.md AGENTS.md backend/context.md
git commit -m "docs: ADR 0008 — local-first iOS pivot; Supabase demoted to queue + cache"
```

---

### Task 2: Migration 0004 — queue v2 + parse_results

**Files:**
- Create: `supabase/migrations/0004_queue_only.sql`

**Interfaces:**
- Consumes: table names from `supabase/migrations/0001_init.sql`.
- Produces: `parse_jobs` v2 columns (`id uuid`, `user_id`, `source_url`, `screenshot_path`, `status`, `error`, `result_url`, `attempts`, `created_at`, `updated_at`), `parse_results` (`normalized_url` PK, `recipe` jsonb, `transcript`, `created_at`), and RPC `claim_parse_jobs(p_limit int, p_max_attempts int)` returning claimed rows with `status='running'`. Tasks 3–5 code against exactly these names.

- [ ] **Step 1: Write the migration**

No automated test exists for SQL files in this repo; correctness is enforced by
matching the names in this file to Tasks 3–5 and by manual apply later.

```sql
-- 0004_queue_only.sql — ADR 0008: Supabase demoted to parse queue + URL cache.
--
-- DESTRUCTIVE by design: all per-domain app data moves on-device (SwiftData).
-- Recipes must be exported first via backend/scripts/export_recipes_to_json.py.
-- Do NOT apply until that export has been run and verified.

begin;

-- ── Demoted tables (data lives on-device now; code stays in git history) ───
drop table if exists public.price_observations;
drop table if exists public.retailer_skus;
drop table if exists public.canonical_products;
drop table if exists public.store_locations;
drop table if exists public.receipts;
drop table if exists public.evaluations;
drop table if exists public.shopping_list_items;
drop table if exists public.pantry_items;
drop table if exists public.planned_meals;
drop table if exists public.meal_plans;
drop table if exists public.recipes cascade;

drop function if exists public.claim_parse_jobs(integer, integer);
drop table if exists public.parse_jobs;

-- ── URL cache ───────────────────────────────────────────────────────────────
-- Screenshot results use the synthetic key 'screenshot:<storage_path>'.
create table public.parse_results (
    normalized_url  text primary key,
    recipe          jsonb not null,
    transcript      text,
    created_at      timestamptz not null default now()
);

-- ── Queue ───────────────────────────────────────────────────────────────────
create table public.parse_jobs (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null default auth.uid(),
    source_url       text,
    screenshot_path  text,
    status           text not null default 'pending'
                     check (status in ('pending', 'running', 'done', 'failed')),
    error            text,
    result_url       text references public.parse_results (normalized_url),
    attempts         integer not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check (source_url is not null or screenshot_path is not null)
);

create index parse_jobs_pending_idx
    on public.parse_jobs (created_at) where status = 'pending';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.parse_jobs enable row level security;
alter table public.parse_results enable row level security;

drop policy if exists "own jobs" on public.parse_jobs;
create policy "own jobs" on public.parse_jobs
    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "authenticated read results" on public.parse_results;
create policy "authenticated read results" on public.parse_results
    for select to authenticated using (true);

-- ── Claim RPC (service-role caller; skip-locked so overlapping runs are safe)
create function public.claim_parse_jobs(p_limit integer, p_max_attempts integer)
returns setof public.parse_jobs
language sql
security definer
set search_path = public
as $$
    update public.parse_jobs j
       set status = 'running', attempts = j.attempts + 1, updated_at = now()
     where j.id in (
         select id from public.parse_jobs
          where status = 'pending' and attempts < p_max_attempts
          order by created_at
          limit p_limit
            for update skip locked
     )
    returning j.*;
$$;

commit;
```

Screenshot uploads reuse the existing private `imports` bucket from
`0002_storage.sql` (already has owner-scoped RLS) — no new bucket.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_queue_only.sql
git commit -m "feat(db): queue-v2 schema — parse_results cache, parse_jobs v2, drop demoted tables (ADR 0008)"
```

---

### Task 3: URL normalization module

**Files:**
- Create: `backend/src/allaroundfood/url_normalize.py`
- Test: `backend/tests/test_url_normalize.py`

**Interfaces:**
- Consumes: nothing (stdlib `urllib.parse` + `httpx` for the default resolver).
- Produces: `normalize_url(url: str, *, resolve: Callable[[str], str] | None = None) -> str` — Task 5's worker calls this with no `resolve` argument.

- [ ] **Step 1: Write the failing tests**

```python
"""Tests for worker-side URL normalization (ADR 0008: cache key derivation)."""

from __future__ import annotations

import pytest

from allaroundfood.url_normalize import SHORTLINK_HOSTS, normalize_url


def test_strips_tracking_params_and_fragment() -> None:
    url = "https://Example.com/Recipe/?utm_source=x&utm_medium=y&fbclid=abc&id=7#steps"
    assert normalize_url(url) == "https://example.com/Recipe?id=7"


def test_lowercases_scheme_and_host_only() -> None:
    assert normalize_url("HTTPS://WWW.Foo.COM/Cake") == "https://www.foo.com/Cake"


def test_strips_trailing_slash_except_root() -> None:
    assert normalize_url("https://foo.com/cake/") == "https://foo.com/cake"
    assert normalize_url("https://foo.com/") == "https://foo.com/"


def test_instagram_tiktok_junk_params_removed() -> None:
    url = "https://www.instagram.com/reel/ABC123/?igsh=xyz&igshid=123&si=zz"
    assert normalize_url(url) == "https://www.instagram.com/reel/ABC123"


def test_shortlink_host_is_resolved_then_normalized() -> None:
    def fake_resolve(url: str) -> str:
        assert url == "https://vm.tiktok.com/ZMabc/"
        return "https://www.tiktok.com/@cook/video/123?_t=8&_r=1"

    result = normalize_url("https://vm.tiktok.com/ZMabc/", resolve=fake_resolve)
    assert result == "https://www.tiktok.com/@cook/video/123"


def test_non_shortlink_host_never_calls_resolver() -> None:
    def boom(url: str) -> str:
        raise AssertionError("resolver must not be called")

    assert normalize_url("https://foo.com/x", resolve=boom) == "https://foo.com/x"


def test_rejects_non_http_url() -> None:
    with pytest.raises(ValueError):
        normalize_url("ftp://foo.com/x")


def test_known_shortlink_hosts() -> None:
    assert "vm.tiktok.com" in SHORTLINK_HOSTS
    assert "vt.tiktok.com" in SHORTLINK_HOSTS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_url_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'allaroundfood.url_normalize'`

- [ ] **Step 3: Implement**

```python
"""URL normalization for the parse-results cache key (ADR 0008).

Normalization happens in the worker, never on the phone: strip tracking
params and fragments, lowercase scheme/host, drop a trailing slash, and
resolve known share-shortlink hosts by following redirects.
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Hosts whose URLs are opaque share-shortlinks; resolved via redirects first.
SHORTLINK_HOSTS = frozenset(
    {"vm.tiktok.com", "vt.tiktok.com", "instagr.am", "pin.it", "bit.ly", "tinyurl.com"}
)

# Query params that never identify content (exact names + utm_* prefix).
_TRACKING_PARAMS = frozenset(
    {"fbclid", "gclid", "igsh", "igshid", "si", "feature", "share_id", "_t", "_r", "mibextid"}
)


def _default_resolve(url: str) -> str:
    """Follow redirects for a shortlink and return the final URL."""
    import httpx

    response = httpx.head(url, follow_redirects=True, timeout=10.0)
    return str(response.url)


def _is_tracking(param: str) -> bool:
    return param in _TRACKING_PARAMS or param.startswith("utm_")


def normalize_url(url: str, *, resolve: Callable[[str], str] | None = None) -> str:
    """Return the canonical cache key for a source URL.

    Args:
        url: The raw URL as shared/submitted.
        resolve: Redirect resolver for shortlink hosts (injectable for tests).

    Raises:
        ValueError: If the URL is not http(s) or has no host.
    """
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError(f"not an http(s) URL: {url!r}")

    if parts.netloc.lower() in SHORTLINK_HOSTS:
        resolver = resolve or _default_resolve
        parts = urlsplit(resolver(url.strip()))

    query = urlencode(
        [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _is_tracking(k)]
    )
    path = parts.path if parts.path in ("", "/") else parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, query, ""))
```

- [ ] **Step 4: Run the gate**

Run: `cd backend && uv run pytest tests/test_url_normalize.py -v && uv run ruff check && uv run mypy src tests`
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/allaroundfood/url_normalize.py backend/tests/test_url_normalize.py
git commit -m "feat(worker): URL normalization for parse-results cache keys"
```

---

### Task 4: Supabase client — queue-v2 helpers (additive)

**Files:**
- Modify: `backend/src/allaroundfood/supabase_client.py` (append new helpers; leave existing ones in place — Task 7 deletes the obsolete ones)
- Test: `backend/tests/test_supabase_client_queue.py`

**Interfaces:**
- Consumes: `Recipe` from `allaroundfood.models`; existing `get_service_client`, `claim_pending_jobs`, `download_import` (all unchanged).
- Produces (Task 5 codes against these exact signatures):
  - `lookup_parse_result(client: Client, normalized_url: str) -> dict[str, Any] | None`
  - `upsert_parse_result(client: Client, normalized_url: str, recipe: Recipe, transcript: str | None) -> None`
  - `mark_job_done(client: Client, job_id: str, result_url: str) -> None`
  - `mark_job_failed(client: Client, job_id: str, message: str) -> None`

- [ ] **Step 1: Write the failing tests**

These use a minimal fake postgrest chain (`table().select().eq().execute()` /
`table().upsert().execute()` / `table().update().eq().execute()`) that records
calls — same spirit as `tests/test_worker.py`'s `FakeSupabaseClient`.

```python
"""Tests for the queue-v2 Supabase helpers (ADR 0008)."""

from __future__ import annotations

from typing import Any, cast

from allaroundfood import supabase_client as sc
from allaroundfood.models import Ingredient, Quantity, Recipe, Step


class FakeResponse:
    def __init__(self, data: Any) -> None:
        self.data = data


class FakeQuery:
    """Records the postgrest call chain and returns canned data on execute."""

    def __init__(self, log: list[tuple[str, Any]], data: Any) -> None:
        self._log = log
        self._data = data

    def select(self, cols: str) -> FakeQuery:
        self._log.append(("select", cols))
        return self

    def upsert(self, row: Any, on_conflict: str = "") -> FakeQuery:
        self._log.append(("upsert", (row, on_conflict)))
        return self

    def update(self, values: dict[str, Any]) -> FakeQuery:
        self._log.append(("update", values))
        return self

    def eq(self, col: str, value: Any) -> FakeQuery:
        self._log.append(("eq", (col, value)))
        return self

    def execute(self) -> FakeResponse:
        return FakeResponse(self._data)


class FakeClient:
    def __init__(self, data: Any = None) -> None:
        self.log: list[tuple[str, Any]] = []
        self.tables: list[str] = []
        self._data = data

    def table(self, name: str) -> FakeQuery:
        self.tables.append(name)
        return FakeQuery(self.log, self._data)


def _recipe() -> Recipe:
    return Recipe(
        id="r1",
        title="Toast",
        ingredients=[Ingredient(name="bread", quantity=Quantity(as_written="1 slice"))],
        steps=[Step(order=1, instruction="Toast it.")],
    )


def test_lookup_parse_result_hit() -> None:
    client = FakeClient(data=[{"normalized_url": "https://x.com/a", "recipe": {"title": "Toast"}}])
    row = sc.lookup_parse_result(cast(Any, client), "https://x.com/a")
    assert row is not None and row["recipe"] == {"title": "Toast"}
    assert client.tables == ["parse_results"]
    assert ("eq", ("normalized_url", "https://x.com/a")) in client.log


def test_lookup_parse_result_miss() -> None:
    client = FakeClient(data=[])
    assert sc.lookup_parse_result(cast(Any, client), "https://x.com/a") is None


def test_upsert_parse_result_serializes_recipe() -> None:
    client = FakeClient()
    sc.upsert_parse_result(cast(Any, client), "https://x.com/a", _recipe(), "hello")
    assert client.tables == ["parse_results"]
    op, (row, on_conflict) = client.log[0]
    assert op == "upsert" and on_conflict == "normalized_url"
    assert row["normalized_url"] == "https://x.com/a"
    assert row["recipe"]["title"] == "Toast"
    assert row["transcript"] == "hello"


def test_mark_job_done_sets_status_and_result_url() -> None:
    client = FakeClient()
    sc.mark_job_done(cast(Any, client), "job-1", "https://x.com/a")
    op, values = client.log[0]
    assert op == "update"
    assert values["status"] == "done"
    assert values["result_url"] == "https://x.com/a"
    assert values["error"] is None
    assert ("eq", ("id", "job-1")) in client.log


def test_mark_job_failed_sets_status_and_error() -> None:
    client = FakeClient()
    sc.mark_job_failed(cast(Any, client), "job-1", "boom")
    op, values = client.log[0]
    assert op == "update" and values["status"] == "failed" and values["error"] == "boom"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_supabase_client_queue.py -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'lookup_parse_result'`

- [ ] **Step 3: Implement (append to `supabase_client.py`)**

```python
# --- Queue v2 (ADR 0008): parse_results cache + done/failed transitions ------


def lookup_parse_result(client: Client, normalized_url: str) -> dict[str, Any] | None:
    """Return the cached ``parse_results`` row for a normalized URL, or None."""
    response = (
        client.table("parse_results")
        .select("*")
        .eq("normalized_url", normalized_url)
        .execute()
    )
    rows: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    return rows[0] if rows else None


def upsert_parse_result(
    client: Client, normalized_url: str, recipe: Recipe, transcript: str | None
) -> None:
    """Write a finished parse into the URL cache (idempotent on the key)."""
    row: dict[str, Any] = {
        "normalized_url": normalized_url,
        "recipe": recipe.model_dump(mode="json"),
        "transcript": transcript,
    }
    client.table("parse_results").upsert(row, on_conflict="normalized_url").execute()


def mark_job_done(client: Client, job_id: str, result_url: str) -> None:
    """Mark a job ``done``, pointing at its ``parse_results`` row."""
    client.table("parse_jobs").update(
        {"status": "done", "error": None, "result_url": result_url, "updated_at": _now_iso()}
    ).eq("id", job_id).execute()


def mark_job_failed(client: Client, job_id: str, message: str) -> None:
    """Mark a job ``failed`` and store the failure message."""
    client.table("parse_jobs").update(
        {"status": "failed", "error": message, "updated_at": _now_iso()}
    ).eq("id", job_id).execute()
```

- [ ] **Step 4: Run the gate**

Run: `cd backend && uv run pytest tests/test_supabase_client_queue.py -v && uv run ruff check && uv run mypy src tests`
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/allaroundfood/supabase_client.py backend/tests/test_supabase_client_queue.py
git commit -m "feat(worker): queue-v2 Supabase helpers — cache lookup/upsert, done/failed"
```

---

### Task 5: Worker rewrite — queue-everything with URL cache

**Files:**
- Rewrite: `backend/src/allaroundfood/worker.py`
- Rewrite: `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `normalize_url` (Task 3); `lookup_parse_result`, `upsert_parse_result`, `mark_job_done`, `mark_job_failed`, `claim_pending_jobs`, `download_import`, `get_service_client` (Task 4 / existing); `parse_recipe_from_url`, `parse_recipe_from_image`, `parse_recipe_from_video_text` (existing, unchanged); `validate_video_url`, `fetch_video_text`, `VideoImportError` (existing); `EvalStore` (existing); `Evaluation` model (existing).
- Produces: `process_job(client, job) -> bool`, `drain_once(client, limit) -> int`, `main(argv) -> int` — CLI flags `--once` (default), `--watch`, `--interval`, `--limit`, `--job-id` all keep their current meaning.

Job dicts now carry `source_url` / `screenshot_path` (v2 schema) instead of `kind` / `storage_path` / `user_id`. Video-vs-web is detected from the normalized URL via `validate_video_url` (raises `VideoImportError` for non-video hosts). Screenshot results use cache key `f"screenshot:{screenshot_path}"`. Evals write to the local `EvalStore` at `settings.pricing_data_dir / "evaluations.parquet"` instead of Supabase.

- [ ] **Step 1: Rewrite `tests/test_worker.py`** (full replacement)

```python
"""Tests for the queue-v2 worker (ADR 0008): cache hit/miss, dispatch, failure.

No real Anthropic / network access: parsers and the video importer are
monkeypatched; Supabase is ``FakeSupabaseClient`` recording every call via the
Task-4 helper seams (the worker calls module-level helpers, which the tests
monkeypatch onto the ``worker`` module namespace).
"""

from __future__ import annotations

from typing import Any, cast

import pytest

from allaroundfood import worker
from allaroundfood.models import Ingredient, Quantity, Recipe, Step
from allaroundfood.parsing.recipe_parser import RecipeParseResult
from allaroundfood.video_import import VideoImportError


def _make_recipe(title: str = "Test") -> Recipe:
    return Recipe(
        id="",
        title=title,
        ingredients=[Ingredient(name="x", quantity=Quantity(as_written="1"))],
        steps=[Step(order=1, instruction="do it")],
    )


def _parse_result(title: str = "Test") -> RecipeParseResult:
    return RecipeParseResult(
        recipe=_make_recipe(title), worker_prompt="PROMPT", stripped_text="TEXT"
    )


class FakeSupabase:
    """Records helper-level calls; results keyed by normalized URL."""

    def __init__(self, cached: dict[str, dict[str, Any]] | None = None) -> None:
        self.cached = cached or {}
        self.upserts: list[tuple[str, Recipe, str | None]] = []
        self.done: list[tuple[str, str]] = []
        self.failed: list[tuple[str, str]] = []
        self.downloads: list[str] = []


@pytest.fixture()
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(
        worker, "lookup_parse_result", lambda c, url: fake.cached.get(url)
    )
    monkeypatch.setattr(
        worker,
        "upsert_parse_result",
        lambda c, url, recipe, transcript: fake.upserts.append((url, recipe, transcript)),
    )
    monkeypatch.setattr(
        worker, "mark_job_done", lambda c, jid, url: fake.done.append((jid, url))
    )
    monkeypatch.setattr(
        worker, "mark_job_failed", lambda c, jid, msg: fake.failed.append((jid, msg))
    )
    monkeypatch.setattr(
        worker,
        "download_import",
        lambda c, path: (fake.downloads.append(path), b"IMAGEBYTES")[1],
    )
    monkeypatch.setattr(worker.settings, "run_evals", False)
    return fake


def _run(fake: FakeSupabase, job: dict[str, Any]) -> bool:
    return worker.process_job(cast(Any, object()), job)


def test_url_cache_hit_marks_done_without_parsing(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake.cached["https://x.com/a"] = {"normalized_url": "https://x.com/a", "recipe": {}}
    monkeypatch.setattr(
        worker, "normalize_url", lambda url: "https://x.com/a"
    )

    def boom(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("must not parse on a cache hit")

    monkeypatch.setattr(worker, "parse_recipe_from_url", boom)
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a?utm_source=z"})
    assert fake.done == [("j1", "https://x.com/a")]
    assert fake.upserts == []


def test_url_cache_miss_parses_and_upserts(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(
        worker, "parse_recipe_from_url", lambda url: _parse_result("Web")
    )
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert len(fake.upserts) == 1
    url, recipe, transcript = fake.upserts[0]
    assert url == "https://x.com/a" and recipe.title == "Web" and transcript is None
    assert fake.done == [("j1", "https://x.com/a")]


def test_video_url_routes_to_video_parser(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    video_url = "https://www.tiktok.com/@c/video/1"
    monkeypatch.setattr(worker, "normalize_url", lambda url: video_url)
    monkeypatch.setattr(worker, "validate_video_url", lambda url: "tiktok")

    class FakeVideo:
        caption = "cap"
        transcript = "words"
        source_url = video_url

    async def fake_fetch(url: str) -> FakeVideo:
        return FakeVideo()

    monkeypatch.setattr(worker, "fetch_video_text", fake_fetch)
    monkeypatch.setattr(
        worker,
        "parse_recipe_from_video_text",
        lambda caption, transcript, source_url: _parse_result("Video"),
    )
    assert _run(fake, {"id": "j1", "source_url": video_url})
    url, recipe, transcript = fake.upserts[0]
    assert recipe.title == "Video" and transcript == "words"


def test_non_video_url_falls_back_to_web(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://blog.com/pie")

    def not_video(url: str) -> str:
        raise VideoImportError("unsupported")

    monkeypatch.setattr(worker, "validate_video_url", not_video)
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result("Pie"))
    assert _run(fake, {"id": "j1", "source_url": "https://blog.com/pie"})
    assert fake.upserts[0][1].title == "Pie"


def test_screenshot_job_downloads_and_parses_image(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        worker,
        "parse_recipe_from_image",
        lambda data, media_type: _parse_result("Shot"),
    )
    job = {"id": "j1", "source_url": None, "screenshot_path": "u/abc.png"}
    assert _run(fake, job)
    assert fake.downloads == ["u/abc.png"]
    assert fake.upserts[0][0] == "screenshot:u/abc.png"
    assert fake.done == [("j1", "screenshot:u/abc.png")]


def test_parse_failure_marks_failed_not_raise(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")

    def boom(url: str) -> Any:
        raise RuntimeError("parser exploded")

    monkeypatch.setattr(worker, "parse_recipe_from_url", boom)
    assert not _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert fake.failed == [("j1", "parser exploded")]
    assert fake.done == []


def test_job_with_neither_source_fails(fake: FakeSupabase) -> None:
    assert not _run(fake, {"id": "j1", "source_url": None, "screenshot_path": None})
    assert len(fake.failed) == 1


def test_drain_processes_all_claimed_jobs(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    jobs = [
        {"id": "j1", "source_url": "https://x.com/a"},
        {"id": "j2", "source_url": None, "screenshot_path": None},  # fails
    ]
    monkeypatch.setattr(worker, "claim_pending_jobs", lambda c, limit, cap: jobs)
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result())
    assert worker.drain_once(cast(Any, object()), 10) == 2
    assert len(fake.done) == 1 and len(fake.failed) == 1


def test_eval_failure_never_fails_job(
    fake: FakeSupabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(worker.settings, "run_evals", True)
    monkeypatch.setattr(worker, "normalize_url", lambda url: "https://x.com/a")
    monkeypatch.setattr(worker, "parse_recipe_from_url", lambda url: _parse_result())

    def eval_boom(job: dict[str, Any], parse: RecipeParseResult) -> None:
        raise RuntimeError("judge down")

    monkeypatch.setattr(worker, "_run_eval", eval_boom)
    assert _run(fake, {"id": "j1", "source_url": "https://x.com/a"})
    assert fake.done == [("j1", "https://x.com/a")]
```

Note for the implementer: the worker must import the collaborators as
module-level names (`from allaroundfood.supabase_client import mark_job_done`,
etc.) so these `monkeypatch.setattr(worker, ...)` seams work. Video-vs-web
dispatch must use `validate_video_url` at module level for the same reason.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_worker.py -v`
Expected: FAIL — attribute errors against the old worker (`mark_job_done` not imported, etc.)

- [ ] **Step 3: Rewrite `worker.py`** (full replacement)

```python
"""Parse-queue worker (ADR 0008: queue everything, URL cache in parse_results).

Runnable as ``python -m allaroundfood.worker``. Flow per drain:

    build service client → claim pending jobs (status→running) → per job:
    normalize URL → cache lookup → hit: mark done · miss: parse (video / web /
    screenshot) → upsert parse_results → mark done pointing at the result.

Design invariants (carried over from the ADR-0007 worker):

- **One bad job never aborts the run** — failures land on the row (``failed``).
- **Idempotency** — results are keyed by normalized URL and upserted, so a
  retry after a partial write converges to the same row.
- **Evals are fire-and-forget** — graded into the local parquet ``EvalStore``;
  a judge error must never fail the job.
- **Exit codes** — 0 even when individual jobs fail; non-zero only on fatal
  startup misconfig (missing Supabase creds).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

from allaroundfood.config import settings
from allaroundfood.parsing.recipe_parser import (
    parse_recipe_from_image,
    parse_recipe_from_url,
    parse_recipe_from_video_text,
)
from allaroundfood.supabase_client import (
    claim_pending_jobs,
    download_import,
    get_service_client,
    lookup_parse_result,
    mark_job_done,
    mark_job_failed,
    upsert_parse_result,
)
from allaroundfood.url_normalize import normalize_url
from allaroundfood.video_import import (
    VideoImportError,
    fetch_video_text,
    validate_video_url,
)

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.parsing.recipe_parser import RecipeParseResult

logger = logging.getLogger("allaroundfood.worker")

# Local eval store (laptop-side per ADR 0008; no Supabase evaluations table).
EVALS_PATH = settings.pricing_data_dir / "evaluations.parquet"

# Storage-object extension → Anthropic image media type (default image/jpeg).
_MEDIA_TYPE_BY_EXT: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
_DEFAULT_MEDIA_TYPE = "image/jpeg"


def _media_type_for(screenshot_path: str) -> str:
    return _MEDIA_TYPE_BY_EXT.get(Path(screenshot_path).suffix.lower(), _DEFAULT_MEDIA_TYPE)


# ── Evals (fire-and-forget, local parquet) ───────────────────────────────────


def _run_eval(job: dict[str, Any], parse: RecipeParseResult) -> None:
    """Grade a successful parse and append it to the local EvalStore."""
    import json
    import uuid

    from allaroundfood.eval_storage import EvalStore
    from allaroundfood.models import Evaluation
    from allaroundfood.parsing.judge import RecipeUrlTextSource, grade_recipe_parse

    source_kind = "url" if job.get("source_url") else "image"
    source_ref = str(job.get("source_url") or job.get("screenshot_path") or job.get("id", ""))
    source_content = (
        RecipeUrlTextSource(text=parse.stripped_text)
        if parse.stripped_text is not None
        else None
    )
    grade = grade_recipe_parse(
        source_kind=source_kind,
        source_ref=source_ref,
        worker_prompt=parse.worker_prompt,
        worker_output=parse.recipe,
        source_content=source_content,
    )
    evaluation = Evaluation(
        id=str(uuid.uuid4()),
        source_kind=source_kind,
        source_ref=source_ref,
        worker_model="claude-haiku-4-5",
        worker_prompt=parse.worker_prompt,
        worker_output=json.dumps(parse.recipe.model_dump(mode="json")),
        worker_parse_confidence=parse.recipe.parse_confidence,
        judge_model="claude-sonnet-4-6",
        judge_prompt=grade.judge_prompt,
        raw_judge_output=grade.raw_judge_output,
        **grade.verdict,
    )
    EvalStore.load(EVALS_PATH).add(evaluation).save()


def _maybe_run_eval(job: dict[str, Any], parse: RecipeParseResult) -> None:
    if not settings.run_evals:
        return
    try:
        _run_eval(job, parse)
    except Exception as exc:  # noqa: BLE001 — evals are strictly best-effort.
        logger.warning("eval skipped for job %s: %s", job.get("id"), exc)


# ── Dispatch ─────────────────────────────────────────────────────────────────


def _parse_url_job(source_url: str) -> tuple[RecipeParseResult, str | None]:
    """Parse a URL job (video platforms → video path, else web page).

    Returns the parse result and the transcript (video only, else None).
    """
    try:
        validate_video_url(source_url)
    except VideoImportError:
        return parse_recipe_from_url(source_url), None
    video = asyncio.run(fetch_video_text(source_url))
    parse = parse_recipe_from_video_text(
        caption=video.caption,
        transcript=video.transcript,
        source_url=video.source_url,
    )
    return parse, video.transcript


def dispatch_job(client: Client, job: dict[str, Any]) -> None:
    """Handle one claimed job; raises on failure (caller marks ``failed``)."""
    job_id = str(job["id"])
    source_url = job.get("source_url")

    if isinstance(source_url, str) and source_url:
        key = normalize_url(source_url)
        if lookup_parse_result(client, key) is not None:
            logger.info("job %s: cache hit for %s", job_id, key)
            mark_job_done(client, job_id, key)
            return
        parse, transcript = _parse_url_job(key)
    else:
        screenshot_path = job.get("screenshot_path")
        if not isinstance(screenshot_path, str) or not screenshot_path:
            raise RuntimeError("job has neither source_url nor screenshot_path")
        key = f"screenshot:{screenshot_path}"
        if lookup_parse_result(client, key) is not None:
            logger.info("job %s: result already written for %s", job_id, key)
            mark_job_done(client, job_id, key)
            return
        data = download_import(client, screenshot_path)
        parse = parse_recipe_from_image(data, _media_type_for(screenshot_path))
        transcript = None

    upsert_parse_result(client, key, parse.recipe, transcript)
    mark_job_done(client, job_id, key)
    _maybe_run_eval(job, parse)


def process_job(client: Client, job: dict[str, Any]) -> bool:
    """Process one claimed job end-to-end; never raises for job-level problems."""
    job_id = str(job.get("id", ""))
    try:
        dispatch_job(client, job)
    except Exception as exc:  # noqa: BLE001 — one bad job must not abort the run.
        logger.exception("job %s failed", job_id)
        try:
            mark_job_failed(client, job_id, str(exc))
        except Exception:  # noqa: BLE001 — even the failure-write is best-effort.
            logger.exception("failed to mark job %s as failed", job_id)
        return False
    logger.info("job %s done", job_id)
    return True


def drain_once(client: Client, limit: int) -> int:
    """Claim up to ``limit`` pending jobs and process them all."""
    jobs = claim_pending_jobs(client, limit, settings.worker_max_attempts)
    if not jobs:
        logger.info("no pending jobs")
        return 0
    logger.info("claimed %d job(s)", len(jobs))
    for job in jobs:
        process_job(client, job)
    return len(jobs)


def process_single_job(client: Client, job_id: str) -> int:
    """Reprocess exactly one job by id (debugging path for ``--job-id``)."""
    response = client.table("parse_jobs").select("*").eq("id", job_id).execute()
    rows: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    if not rows:
        logger.warning("job %s not found", job_id)
        return 0
    process_job(client, rows[0])
    return 1


# ── CLI ──────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m allaroundfood.worker",
        description="Drain the parse_jobs queue (ADR 0008).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Drain pending jobs and exit (default).")
    mode.add_argument("--watch", action="store_true", help="Poll the queue forever.")
    parser.add_argument("--interval", type=float, default=30.0, help="Watch poll seconds.")
    parser.add_argument("--limit", type=int, default=10, help="Max jobs per drain.")
    parser.add_argument("--job-id", type=str, default=None, help="Reprocess one job by id.")
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code (0 unless startup fails)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_parser().parse_args(argv)

    try:
        client = get_service_client()
    except RuntimeError:
        logger.exception("fatal: could not build the Supabase service client")
        return 2

    if args.job_id is not None:
        process_single_job(client, args.job_id)
        return 0

    if args.watch:
        logger.info("watch mode: polling every %.1fs (limit=%d)", args.interval, args.limit)
        try:
            while True:
                drain_once(client, args.limit)
                time.sleep(args.interval)
        except KeyboardInterrupt:  # pragma: no cover — interactive stop.
            logger.info("watch interrupted; exiting")
        return 0

    drain_once(client, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the gate**

Run: `cd backend && uv run pytest tests/test_worker.py -v && uv run ruff check && uv run mypy src tests && uv run pytest`
Expected: all PASS / clean. (The full suite still passes because Task 4 left the old helpers in place; only `test_worker.py` was replaced.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/allaroundfood/worker.py backend/tests/test_worker.py
git commit -m "feat(worker): queue-everything rewrite — URL cache, video/web/screenshot dispatch, local evals (ADR 0008)"
```

---

### Task 6: Recipe export script (parquet → JSON for iOS first-run import)

**Files:**
- Create: `backend/scripts/export_recipes_to_json.py`
- Test: `backend/tests/test_export_recipes.py`

**Interfaces:**
- Consumes: `RecipeStore.load(path) -> RecipeStore`, `.all() -> list[Recipe]`, `.add(recipe) -> RecipeStore`, `.save()` from `allaroundfood.storage`.
- Produces: `export_recipes(parquet_path: Path, out_path: Path) -> int` and a CLI (`uv run python scripts/export_recipes_to_json.py [--parquet PATH] [--out PATH]`). Output file: a JSON **array** of Recipe objects (`model_dump(mode="json")`) — the exact shape the iOS app's first-run importer will decode.

- [ ] **Step 1: Write the failing test**

```python
"""Tests for the one-off parquet → JSON recipe export (ADR 0008 migration)."""

from __future__ import annotations

import json
from pathlib import Path

from allaroundfood.models import Ingredient, Quantity, Recipe, Step
from allaroundfood.storage import RecipeStore
from scripts.export_recipes_to_json import export_recipes


def _recipe(recipe_id: str, title: str) -> Recipe:
    return Recipe(
        id=recipe_id,
        title=title,
        ingredients=[Ingredient(name="flour", quantity=Quantity(as_written="2 cups"))],
        steps=[Step(order=1, instruction="Mix.")],
    )


def test_export_writes_json_array(tmp_path: Path) -> None:
    parquet = tmp_path / "recipes.parquet"
    store = RecipeStore.load(parquet).add(_recipe("a", "Bread")).add(_recipe("b", "Soup"))
    store.save()

    out = tmp_path / "recipes.json"
    count = export_recipes(parquet, out)

    assert count == 2
    data = json.loads(out.read_text())
    assert isinstance(data, list) and len(data) == 2
    titles = {r["title"] for r in data}
    assert titles == {"Bread", "Soup"}
    # Round-trips through the pydantic schema (the iOS decode contract).
    for row in data:
        Recipe.model_validate(row)


def test_export_empty_store(tmp_path: Path) -> None:
    out = tmp_path / "recipes.json"
    count = export_recipes(tmp_path / "missing.parquet", out)
    assert count == 0
    assert json.loads(out.read_text()) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_export_recipes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.export_recipes_to_json'`
(If `scripts/` isn't importable, add an empty `backend/scripts/__init__.py` — check whether `test_api.py`-era tests already import from `scripts`; `migrate_parquet_to_supabase.py` lives there.)

- [ ] **Step 3: Implement**

```python
"""One-off export: data/recipes.parquet → JSON array for iOS first-run import.

Usage (from backend/):
    uv run python scripts/export_recipes_to_json.py \
        --parquet ../data/recipes.parquet --out ../data/recipes_export.json

The output is a JSON array of Recipe objects (``model_dump(mode="json")``) —
the iOS app imports this file via the Files picker on first run (ADR 0008).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from allaroundfood.config import REPO_ROOT
from allaroundfood.storage import RecipeStore


def export_recipes(parquet_path: Path, out_path: Path) -> int:
    """Write all recipes in the store to ``out_path`` as a JSON array.

    Args:
        parquet_path: The recipes parquet file (missing → empty export).
        out_path: Destination JSON file (overwritten).

    Returns:
        The number of recipes exported.
    """
    store = RecipeStore.load(parquet_path)
    recipes = [recipe.model_dump(mode="json") for recipe in store.all()]
    out_path.write_text(json.dumps(recipes, indent=2))
    return len(recipes)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", type=Path, default=REPO_ROOT / "data" / "recipes.parquet")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "data" / "recipes_export.json")
    args = parser.parse_args(argv)
    count = export_recipes(args.parquet, args.out)
    print(f"exported {count} recipe(s) → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the gate**

Run: `cd backend && uv run pytest tests/test_export_recipes.py -v && uv run ruff check && uv run mypy src tests`
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/export_recipes_to_json.py backend/tests/test_export_recipes.py
git commit -m "feat(scripts): export recipes parquet to JSON for iOS first-run import"
```

---

### Task 7: Slim the backend to the worker

**Files:**
- Delete: `backend/src/allaroundfood/{api.py, __main__.py, aisles.py, shopping_logic.py, shopping_storage.py, pantry_storage.py, meal_plan_storage.py}`, `backend/src/allaroundfood/messaging/`, `backend/src/allaroundfood/ocr/`, `backend/src/allaroundfood/pricing/`, `backend/scripts/migrate_parquet_to_supabase.py`
- Delete: `backend/tests/{test_api.py, test_messaging.py, test_aisles.py, test_shopping_logic.py, test_shopping_storage.py, test_pantry_storage.py, test_meal_plan_storage.py}`, `backend/tests/ocr/`, `backend/tests/pricing/`
- Modify: `backend/src/allaroundfood/supabase_client.py` (remove obsolete helpers), `backend/pyproject.toml` (prune deps), `backend/Dockerfile.worker` (drop OCR/pricing artifacts), `backend/src/allaroundfood/config.py` (prune dead settings)

**Interfaces:**
- Consumes: everything Tasks 3–6 left green.
- Produces: a backend whose only surfaces are the worker CLI and the export script. Kept modules: `config, models, storage, eval_storage, naming (only if still imported — verify below), transcription, video_import, url_normalize, supabase_client, parsing/, worker`.

- [ ] **Step 1: Delete out-of-scope modules and their tests**

```bash
cd backend
git rm -r src/allaroundfood/messaging src/allaroundfood/ocr src/allaroundfood/pricing \
    src/allaroundfood/api.py src/allaroundfood/__main__.py src/allaroundfood/aisles.py \
    src/allaroundfood/shopping_logic.py src/allaroundfood/shopping_storage.py \
    src/allaroundfood/pantry_storage.py src/allaroundfood/meal_plan_storage.py \
    scripts/migrate_parquet_to_supabase.py \
    tests/ocr tests/pricing tests/test_api.py tests/test_messaging.py \
    tests/test_aisles.py tests/test_shopping_logic.py tests/test_shopping_storage.py \
    tests/test_pantry_storage.py tests/test_meal_plan_storage.py
```

- [ ] **Step 2: Remove the obsolete supabase_client helpers**

Delete from `supabase_client.py`: `insert_recipe`, `insert_receipt`,
`insert_shopping_items`, `insert_evaluation`, `mark_done`, `mark_error`, and
the now-unused `Receipt`/`ShoppingListItem` TYPE_CHECKING imports and `uuid`
import. Keep: `get_service_client`, `claim_pending_jobs`, `download_import`,
`_now_iso`, and the four Task-4 helpers.

- [ ] **Step 3: Check for dangling imports of deleted modules**

```bash
cd backend
grep -rn "aisles\|shopping_logic\|shopping_storage\|pantry_storage\|meal_plan_storage\|allaroundfood.ocr\|allaroundfood.pricing\|messaging\|insert_recipe\|insert_receipt\|insert_shopping_items\|insert_evaluation\|mark_done\|mark_error" src tests scripts || echo CLEAN
```
Expected: `CLEAN` (fix any hit by removing the import/usage — models.py may keep
`ShoppingListItem`/`PantryItem`/`Aisle` etc.: leave `models.py` untouched, it is
the schema source of truth the iOS port mirrors). Also check `naming.py`:
`grep -rn "naming" src tests` — if only deleted modules used it, `git rm` it too.

- [ ] **Step 4: Prune `pyproject.toml` dependencies**

For each dependency in `[project.dependencies]` / dependency groups, keep only
those still imported. Verify each removal candidate first, e.g.:

```bash
cd backend
for pkg in fastapi uvicorn python-multipart pdf2image sentence-transformers \
           playwright llama-cpp-python torch pillow; do
  echo "== $pkg =="; grep -rln "$pkg\|${pkg//-/_}" src scripts || echo "unused"
done
```

Remove every "unused" one from `pyproject.toml`, then: `uv lock`.
Expected keepers include: `pydantic`, `pydantic-settings`, `polars`, `httpx`,
`anthropic`, `supabase`, `pywhispercpp`, `yt-dlp` (if a Python dep — it may be a
binary requirement only). Do not remove anything that still has an import hit.

- [ ] **Step 5: Trim `Dockerfile.worker`**

Remove Qwen-GGUF/OCR/pricing model downloads and any Playwright/poppler layers;
keep ffmpeg + yt-dlp + whisper model provisioning. (Read the file; delete only
lines that reference deleted modules/models.) Also prune `config.py` settings
that now reference nothing: `kroger_client_id`, `kroger_client_secret`,
`disable_unofficial_ingestion`, `embedding_model_name`, `qwen_gguf_path`
(verify each with grep first; keep `pricing_data_dir` — the eval store uses it).

- [ ] **Step 6: Run the full gate**

Run: `cd backend && uv run ruff check && uv run mypy src tests && uv run pytest`
Expected: all clean/green, with the suite now covering: storage, eval_storage,
naming (if kept), transcription, video_import, parsing, url_normalize,
supabase_client_queue, worker, export.

- [ ] **Step 7: Commit**

```bash
git add -A backend
git commit -m "refactor(backend): slim to the parse worker — drop API, OCR, pricing, messaging, domain stores (ADR 0008)"
```

---

## Completion / handoff checklist

- [ ] Full gate green: `cd backend && uv run ruff check && uv run mypy src tests && uv run pytest`
- [ ] `diff CLAUDE.md AGENTS.md` → identical
- [ ] No file under `frontend/` modified: `git diff --stat main.. -- frontend/` is empty
- [ ] **Manual Tanner steps (do not automate):**
  1. Run the export: `cd backend && uv run python scripts/export_recipes_to_json.py` and verify the JSON.
  2. Apply `supabase/migrations/0004_queue_only.sql` to the Supabase project (destructive — export first).
  3. Update the laptop cron entry to `worker --once` every 10–15 min if not already.
- [ ] Follow-up plan to write next: the iOS app (`ios/`) — consumes `parse_results.recipe` JSON; generate decode fixtures from `parse_recipe_from_*` test fixtures.
