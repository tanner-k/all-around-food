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
