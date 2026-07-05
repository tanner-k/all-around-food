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
Python 3.12 + FastAPI + Polars (file-backed)

## Runtime requirements
- `yt-dlp` for fetching supported Instagram/TikTok recipe video media and metadata
- `ffmpeg` for audio extraction/transcoding before transcription
- local whisper.cpp speech-to-text, in-process via the `pywhispercpp` package (no external service, no separate binary — the runtime ships in the pip wheel). See ADR 0006.
  - `WHISPER_MODEL` selects the model by name (default `base.en`); English `.en` models suit English recipe videos. `WHISPER_MODELS_DIR` (optional) points at a directory of pre-downloaded ggml `.bin` files, or where a named model is cached.
  - ggml model `.bin` files download on first use from huggingface.co (`tiny.en` ≈ 75 MB, `base.en` ≈ 142 MB). In network-restricted environments (including CI and some deploys) huggingface.co may be blocked, so provision the model as a file: pre-download it and point `WHISPER_MODELS_DIR` at it, or run first-use where egress is allowed. The FastAPI startup hook will log whether `yt-dlp` and `ffmpeg` resolved (ADR 0002 follow-up).
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
- Keep FastAPI route modules grouped by resource.
- Validation at the edge (request → typed input) — never trust the client
- Errors surface as typed problem objects; do not throw raw strings
- All shared env access goes through `config.py` — fail loudly if a required env var is missing
- Pricing context lives at `src/allaroundfood/pricing/context.md`
- OCR context lives at `src/allaroundfood/ocr/context.md`
- `messaging/` sends the shopping list via Apple Messages (`osascript`); macOS-only, raises `MessagingError` elsewhere. Recipient numbers pass through `messaging.phone.normalize_phone` before reaching AppleScript.
