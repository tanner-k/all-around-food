# backend/

## Scope
- Local import/eval worker
- Business logic & domain models
- Recipe parsing, video transcription, receipt OCR, and pricing support libraries
- Messaging helpers retained for future local-only workflows

## Not in scope
- UI rendering → `frontend/`
- Database schema → `data/`
- Cloud infrastructure → `infra/`

## Stack
Python 3.12 + Supabase service-role client + Polars for deferred pricing/OCR Parquet paths

## Runtime requirements
- `yt-dlp` for fetching supported Instagram/TikTok recipe video media and metadata
- `ffmpeg` for audio extraction/transcoding before transcription
- local whisper.cpp speech-to-text, in-process via the `pywhispercpp` package (no external service, no separate binary — the runtime ships in the pip wheel). See ADR 0006.
  - `WHISPER_MODEL` selects the model by name (default `base.en`); English `.en` models suit English recipe videos. `WHISPER_MODELS_DIR` (optional) points at a directory of pre-downloaded ggml `.bin` files, or where a named model is cached.
  - ggml model `.bin` files download on first use from huggingface.co (`tiny.en` ≈ 75 MB, `base.en` ≈ 142 MB). In network-restricted environments (including CI and some deploys) huggingface.co may be blocked, so provision the model as a file: pre-download it and point `WHISPER_MODELS_DIR` at it, or run first-use where egress is allowed.
- Playwright Chromium for pricing adapter fallback fetches: `uv run playwright install chromium`
- Poppler for `pdf2image` receipt PDF preprocessing: `brew install poppler` on macOS
- Qwen2-VL GGUF for real receipt OCR: `bash scripts/download_qwen.sh`, then set `QWEN_GGUF_PATH`
- Docker Desktop for the scheduled local worker image; launchd runs `docker run ... allaroundfood-worker --once`

## Worker operations
- Preflight before scheduling: `uv run python -m allaroundfood.worker --doctor`
- Prefetch/cache local models: `uv run python -m allaroundfood.worker --prefetch-models`
- Drain once for a smoke test: `uv run python -m allaroundfood.worker --once`
- Build the scheduled image from the repo root: `docker build -f backend/Dockerfile.worker -t allaroundfood-worker backend`
- Supported local scheduler: macOS launchd via `infra/worker/com.allaroundfood.worker.plist` and `infra/worker/install_launchd.sh`
- The Docker worker mounts host models at `/models`; use `QWEN_GGUF_PATH=/models/qwen2-vl.gguf` and `WHISPER_MODELS_DIR=/models/whisper`

## Local skills / conventions
- test-driven-development
- python-reviewer

## Run
```bash
cd backend
uv run python -m allaroundfood.worker --once
```

## Notes for agents
- `python -m allaroundfood.worker --once` drains pending Supabase `parse_jobs`.
- Validation at the worker boundary remains required — never trust queued payloads.
- All shared env access goes through `config.py` — fail loudly if a required env var is missing
- Pricing context lives at `src/allaroundfood/pricing/context.md`
- OCR context lives at `src/allaroundfood/ocr/context.md`
- `messaging/` sends the shopping list via Apple Messages (`osascript`); macOS-only, raises `MessagingError` elsewhere. Recipient numbers pass through `messaging.phone.normalize_phone` before reaching AppleScript.
