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
