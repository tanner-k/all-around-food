# Worker Reliability Implementation Plan

**Status:** In progress  
**Date:** 2026-07-05  
**Scope:** Make the local import worker boringly reliable: installed scheduling,
model prefetch, documented system dependencies, retry/attempt handling,
Supabase keepalive, and queue-status UX for long phone imports.

## Current Grounding

- The worker already drains `parse_jobs` with `python -m allaroundfood.worker --once`.
- `supabase/migrations/0003_claim_and_payload.sql` already adds `payload_text`
  and the atomic `claim_parse_jobs` RPC.
- `infra/worker/com.allaroundfood.worker.plist` already exists as a launchd
  template.
- `.github/workflows/supabase-keepalive.yml` already pings Supabase weekly.
- `/import` already renders `ImportQueue`, with Realtime plus polling fallback.

## Implementation Tracks

### 1. Worker Preflight and Model Prefetch

Add two worker CLI modes:

- `--doctor`: check required worker configuration and local dependencies.
- `--prefetch-models`: load/cache Whisper `base.en` and verify the configured
  Qwen GGUF exists.

The checks should use existing settings and helpers:

- Supabase worker env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Anthropic parsing env: `ANTHROPIC_API_KEY_PARSING`.
- Video binaries: `yt-dlp`, `ffmpeg`, honoring `YTDLP_BIN` and `FFMPEG_BIN`.
- Whisper config: `WHISPER_MODEL`, `WHISPER_MODELS_DIR`.
- Receipt OCR config: `QWEN_GGUF_PATH`.

The command should print clear pass/fail lines and exit nonzero when a required
check fails. Prefetch may need network on first Whisper download; that should be
called out in docs rather than hidden.

### 2. Scheduling Runbook

Keep launchd as the official local scheduler. Add a small installer or exact
runbook that covers:

- Build the worker Docker image.
- Prepare the model directory.
- Fill `__REPO__`, `__MODELS__`, and Docker binary path in the plist.
- Load, start, inspect, reload, and uninstall the launch agent.
- Tail stdout/stderr logs.

Do not introduce a new scheduler service. Cron can be mentioned as inferior for
sleeping Macs, but launchd remains the supported path.

### 3. Queue Reliability

Add stale-job recovery before claiming fresh pending jobs:

- A Supabase RPC should reset `processing` jobs older than a configurable
  threshold back to `pending`.
- Attempts should be preserved; the existing max-attempt guard still decides
  whether the job can be claimed again.
- Worker should call stale recovery at the start of `drain_once`.

Manual retry should be explicit:

- Frontend retry resets `status` to `pending`, clears `error`, and resets
  `attempts` to `0`.
- UI should avoid offering Retry for jobs that are not in `error`.

### 4. Queue Status UX

Improve the existing `ImportQueue` rather than building a new surface:

- Show elapsed time from `created_at` or `updated_at`.
- Show attempts when attempts are nonzero.
- Use plain copy for long-running states:
  - Pending: waiting for the local worker.
  - Processing: working locally; video imports can take a few minutes.
  - Done: recipe is ready.
  - Error: show recovery path.
- Avoid fake ETAs or fake progress bars.

### 5. Supabase Keepalive

Keep the existing GitHub Actions keepalive. Update docs to list required secrets
and manual verification. Do not add a second keepalive system unless the current
workflow proves insufficient.

### 6. Verification

Run the smallest meaningful checks first:

- Backend focused tests for worker CLI/preflight and stale-job recovery.
- Frontend ImportQueue tests for long-running copy, elapsed/attempt metadata,
  and retry reset behavior.

Then run broader checks when practical:

```bash
cd backend
uv run ruff check
uv run mypy
uv run pytest

cd ../frontend
pnpm lint
pnpm build
```

Manual smoke:

1. Enqueue an import from the phone.
2. Run the worker once or trigger launchd.
3. Confirm queue moves through `pending` / `processing` / `done`.
4. Open the resulting recipe.
5. Force a failed job and confirm Retry works.

## Ownership Split

- Main implementation: worker CLI, stale-job RPC, worker integration, backend
  tests, final verification.
- Frontend subagent: `ImportQueue` UX and related frontend tests.
- Runbook subagent: launchd install helper and operational docs.

