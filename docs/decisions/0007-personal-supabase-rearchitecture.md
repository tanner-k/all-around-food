# 0007 — Personal re-architecture: Supabase + local containerized parse worker

**Status:** Accepted
**Date:** 2026-06-29
**Supersedes:** the infra portion of ADR 0001 (hosted FastAPI backend on Vercel);
the Parquet-first storage stance of ADR 0005 (its Postgres-migration trigger is now met,
architecture-driven rather than scale-driven).
**Relates to:** ADR 0003 (pricing scope — unchanged), ADR 0004 (canonical matching —
embedding model choice stands; storage moves to `pgvector`).

## Context

The project is shifting to a **personal, low-cost** build. Goals:

- Access saved recipes and plan/cook from a **phone**.
- Keep **all parsing/ML compute** (Claude parse, whisper.cpp transcription, Qwen OCR,
  embeddings, pricing adapters) on a capable **local device** — no paid always-on inference host.
- Minimize recurring cost (≈ **$0/mo** target).

The current architecture is a hosted FastAPI + Polars/Parquet backend that the Next.js
app proxies to (`BACKEND_URL`). That needs an always-on, heavy host (ffmpeg + torch +
GGUF weights) and puts the Anthropic key in the cloud — the opposite of the new goals.

## Decision

1. **Supabase (Postgres) is the system of record.** All app data — recipes, meal plans,
   shopping list, pantry, evaluations, **and pricing** — moves from the Parquet `*Store`
   classes into Supabase tables. JSON-shaped fields (ingredients / steps / nutrition /
   judge output) use `jsonb`. Canonical-product embeddings use **`pgvector`** (the
   `bge-small-en-v1.5` / 384-dim choice from ADR 0004 stands; only the storage changes).
2. **Supabase Auth + Row-Level Security** gate all data to the owner. Single user for now,
   but every table carries `user_id` defaulting to `auth.uid()` so multi-user is a policy
   change, not a migration.
3. **Frontend is a responsive PWA on Vercel**, reading/writing Supabase directly (server
   components under RLS). No hosted backend. Vercel holds only `NEXT_PUBLIC_SUPABASE_URL`
   + anon key. **The Anthropic key leaves the cloud entirely.**
4. **Recipe import is a queue.** The PWA uploads source media to a Supabase Storage bucket
   and inserts a `parse_jobs` row (`status='pending'`). No inline parsing on the web.
5. **Parsing runs in a containerized worker.** A Docker image bundles the app +
   `ffmpeg` + `yt-dlp` + whisper.cpp + Qwen GGUF + torch. Entry point `worker --once`
   processes all pending jobs then exits, so it can be driven by **cron locally today** and
   re-hosted as a **scheduled cloud container later** (ECS Scheduled Task / Fly machine /
   VM cron) with no code change. All config (Supabase service-role key, Anthropic key,
   model paths) is env-driven.
6. **Pricing is deferred, not user-facing.** The pricing library, adapters, analytics,
   and Parquet stores stay in the backend for local/OCR support. The `/prices` UI and
   proxy routes are removed until a future pricing migration plan moves pricing data to
   Postgres/pgvector.

## Consequences

- (positive) ≈ $0/mo: Vercel hobby + Supabase free tier + local inference. Secrets and
  heavy native deps stay on the local machine. Phone access via installable PWA, zero
  native build.
- (positive) The worker is **cloud-portable from day one** (container + `--once` +
  env config), so a future "run parses in the cloud" pivot is a hosting change only.
- (tradeoff) Large data-layer rewrite: every `*Store` and `/api` proxy route is replaced
  by Supabase access; new Auth, RLS, queue, and worker.
- (tradeoff) Supabase free projects **pause after ~1 week idle** → weekly keep-alive ping
  (cron / GitHub Action / UptimeRobot), or Pro ($25/mo) to remove the pause.
- (tradeoff) Import is **no longer instant** — a recipe appears after the next worker run
  (cron interval or manual trigger).
- (followup) Update `CLAUDE.md`/`AGENTS.md` §7–§8, `README`, `docs/architecture.md`, and
  `ADR 0001`/`0005` to reflect Supabase + worker. Park the deploy-centric P0/P1 of
  `docs/plans/polish-roadmap.md`; new work tracked in
  `docs/plans/personal-supabase-pivot.md`.

## Alternatives considered

- **Native iOS (SwiftUI):** rejected for now — rebuilds the whole UI + $99/yr Apple
  Developer account; the PWA reuses 100% of the existing React. Revisit later as a wrapper.
- **Keep the hosted FastAPI backend (EC2/Fargate/Fly):** rejected — always-on cost +
  cloud-resident secrets, against the personal/cheap goal.
- **Inline parsing on Vercel/serverless:** rejected — heavy native deps and long video
  jobs don't fit serverless time/size limits, and it defeats "keep compute local."
- **Keep Parquet, sync files to the phone:** rejected — no auth, no concurrent web access,
  no clean mobile story.
