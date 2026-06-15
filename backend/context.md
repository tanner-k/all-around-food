# backend/

## Scope
- HTTP/API endpoints
- Business logic & domain models
- Authentication / authorization
- Background jobs, schedulers, queue workers

## Not in scope
- UI rendering → `frontend/`
- Database schema → `data/`
- Cloud infrastructure → `infra/`

## Stack
Python 3.12 + Polars (file-backed; FastAPI planned)

## Runtime requirements
- `yt-dlp` for fetching supported Instagram/TikTok recipe video media and metadata
- `ffmpeg` for audio extraction/transcoding before transcription
- external `whispr` FastAPI service running at `WHISPR_URL` (default `http://localhost:8000`) for speech-to-text; prefer the external service over vendoring Whisper models into this repo
  - ⚠️ Port collision: this backend (uvicorn) and `whispr` both default to `:8000`. Locally, run one of them on a different port — typically `whispr` on `:8000` and this backend on `:8001` (e.g. `uv run uvicorn allaroundfood.api:app --port 8001` with `WHISPR_URL` left at its default). If you flip them, set `BACKEND_URL` in `frontend/.env.local` and `WHISPR_URL` in the backend env accordingly. The FastAPI startup hook will log whether `yt-dlp` and `ffmpeg` resolved (ADR 0002 follow-up).
- Playwright Chromium for pricing adapter fallback fetches: `uv run playwright install chromium`
- Poppler for `pdf2image` receipt PDF preprocessing: `brew install poppler` on macOS
- Qwen2-VL GGUF for real receipt OCR: `bash scripts/download_qwen.sh`, then set `QWEN_GGUF_PATH`

## Local skills / conventions
- test-driven-development
- python-reviewer

## Run
```bash
cd backend
uv run python -m allaroundfood
```

## Notes for agents
- One route file per resource (e.g. `routes/users.ts`)
- Validation at the edge (request → typed input) — never trust the client
- Errors surface as typed problem objects; do not throw raw strings
- All env access through a single `config.ts` — fail loudly if a required env var is missing
- Pricing context lives at `src/allaroundfood/pricing/context.md`
- OCR context lives at `src/allaroundfood/ocr/context.md`
- `messaging/` sends the shopping list via Apple Messages (`osascript`); macOS-only, raises `MessagingError` elsewhere. Recipient numbers pass through `messaging.phone.normalize_phone` before reaching AppleScript.
