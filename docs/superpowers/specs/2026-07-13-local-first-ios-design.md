# Design: Local-first iOS app + parse queue

**Date:** 2026-07-13
**Status:** Approved (brainstorm)
**Supersedes:** the PWA and Supabase-as-system-of-record parts of ADR 0007. The
containerized local worker from ADR 0007 is retained (video + all parsing).
**To be recorded as:** ADR 0008.

## Goal

A native iOS app (personal use, sideload/TestFlight — not App Store) where all
daily-use data lives on-device. The phone works fully offline for planning,
cookbook, cook mode, pantry, and shopping lists. The only server-side pieces are
a Supabase job queue and the existing laptop parse worker.

## Decisions made

- **Audience:** just Tanner. Personal app; no App Store constraints, no multi-user.
- **Parsing:** all imports (URL, screenshot, video) are parsed by the laptop
  worker via a Supabase queue ("queue everything"). Rationale: Tanner's iPhone
  predates Apple Intelligence, so on-device Foundation Models are unavailable;
  keeping one parse engine on the laptop reuses the existing Claude prompts,
  whisper.cpp, yt-dlp, and eval pipeline with no key on the phone.
- **Worker does the full parse** (not transcribe-only): returns a finished
  recipe JSON.
- **URL cache:** parse results are cached by normalized source URL; a re-shared
  URL resolves instantly without re-parsing.
- **Repo layout:** iOS app lives in `ios/` in this repo. `frontend/` is frozen
  (no new work; stays in git). `backend/` is slimmed to the worker.
- **Dropped from scope:** grocery pricing, store price comparison, Kroger
  export, receipt OCR (Qwen). Code remains in git history; no further work.
- **v1 features:** weekly planning, calendar export, shopping list via
  iMessage, recipe import (web/screenshot/video), simple pantry, smart shopping
  list (planned recipes minus pantry), cook mode.

## Architecture

```
 ┌──────────────────┐  submit parse_jobs / poll results   ┌──────────────────────┐
 │  iOS app (ios/)  │ ──────────────────────────────────▶ │  Supabase            │
 │  SwiftUI +       │ ◀────────────────────────────────── │  queue + URL cache   │
 │  SwiftData       │        finished recipe JSON         │  + screenshot bucket │
 │  (all app data)  │                                     └──────────┬───────────┘
 └──────────────────┘                                                │ cron: worker --once
                                                          ┌──────────▼───────────┐
                                                          │  Laptop worker        │
                                                          │  yt-dlp · ffmpeg ·    │
                                                          │  whisper.cpp · Claude │
                                                          └──────────────────────┘
```

The phone touches the network for exactly two things: submitting an import job
and pulling back finished recipes. Everything else is local SwiftData.

## iOS app (`ios/`)

- **Stack:** Swift, SwiftUI, SwiftData. iOS 17 minimum. Only third-party
  dependency at start: `supabase-swift`.
- **Recipe model:** Swift port of the existing Pydantic/Zod Recipe schema —
  same fields, so worker Claude output decodes directly.

Screens (mirroring the web app's five tabs):

1. **Plan** — week grid, assign recipes to days/meals. Calendar export via
   EventKit: one event per planned meal into a user-chosen calendar.
2. **Cookbook** — list + detail (hero, meta pills, grouped ingredients, ported
   from the Cookbook App Flow design). Cook mode: step-by-step and full-scroll
   layouts, per-step timers (native `Timer`; Live Activities later),
   mark-cooked increments `times_made`.
3. **Shop** — smart list: union of ingredients from planned recipes minus
   pantry stock, grouped by category, check-off. Send via the share sheet as
   plain text (covers iMessage and everything else; no Messages API).
4. **Pantry** — flat list: item, quantity, optional category. Manual add /
   edit / decrement only. No expiry, no receipt OCR.
5. **Import** — paste a URL or pick a screenshot. Primary path is a **Share
   Extension**: share from Safari/Instagram/TikTok into the app, which enqueues
   the job and shows a "parsing…" row until the result lands.

## Supabase (queue + cache only)

Demoted from system of record. Holds no meal plans, pantry, or shopping data.
RLS on; single user.

- `parse_jobs`: `id`, `source_url` (nullable), `screenshot_path` (nullable),
  `status` (`pending` | `running` | `done` | `failed`), `error`, `created_at`.
- `parse_results`: `normalized_url` (PK), `recipe` jsonb, `transcript` text
  (kept for re-parse/debugging), `created_at`. This table **is** the URL cache.
- Storage bucket for screenshot uploads.

URL normalization (strip tracking params, resolve share-shortlinks) happens in
the **worker**, not the phone. The phone always just submits a job; on a cache
hit the worker marks the job `done` immediately, pointing at the cached recipe.
One code path; the cache is invisible to the app.

## Laptop worker

Existing `backend/` code, slimmed, with a thin `worker --once` entry point
(cron every 10–15 min while the laptop is awake):

1. Pull pending jobs.
2. Per job: cache lookup by normalized URL → else fetch (yt-dlp for video
   URLs, plain HTTP for web pages, Storage download for screenshots) →
   transcribe if video (whisper.cpp, per ADR 0006) → Claude parse (existing
   prompts) → write `parse_results`, mark job `done`.

The Anthropic key lives only in the worker's env. Never on the phone.

## Sync model

No push infrastructure in v1. The app polls its open jobs when foregrounded;
pending imports resolve on next open. Finished recipes are copied into
SwiftData and the `parse_jobs` row is deleted. Supabase retains only
`parse_results` (the cache) long-term.

## Error handling

- Failed parse → job `failed` with an error string; shown on the import row
  with a retry button.
- Laptop offline → jobs sit `pending`; import row shows "waiting for parser."
- Network unavailable on phone → import submission queued locally and retried;
  all other features unaffected (fully offline).

## Testing

- Worker: existing pytest suite carries over (parse tests, FakeTranscriber
  video tests). Eval pipeline (LLM-as-judge) stays laptop-side, grading worker
  parses.
- iOS: XCTest for smart-list math (planned − pantry) and Recipe schema
  decoding against worker output fixtures.

## Migration

- Existing `data/recipes.parquet`: one-off script exports recipes to a JSON
  file; the app imports it on first run via the Files picker. No live
  migration.

## Documentation changes

- New ADR 0008 recording this decision (supersedes ADR 0007's PWA /
  system-of-record parts; retains its worker).
- Update `CLAUDE.md` + `AGENTS.md` (same commit): add `ios/` to the project
  map, mark `frontend/` frozen, update Deploy and working-state sections.
- Update `backend/context.md` for the slimmed worker scope.

## Future (explicitly out of v1)

- Apple Foundation Models on-device parsing when Tanner upgrades phones
  (parsing already isolated behind the queue, so this is an additive path).
- Grocery pricing / Kroger export revisit.
- Push notifications for finished parses; Live Activities for cook timers.
