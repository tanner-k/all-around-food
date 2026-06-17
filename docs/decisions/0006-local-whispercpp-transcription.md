# 0006 — Local whisper.cpp transcription

**Status:** Accepted
**Date:** 2026-06-17

## Context
ADR 0002 routed video-recipe speech-to-text through an external `whispr` FastAPI service over HTTP at `WHISPR_URL`. In practice this added an extra service to run, version, and health-check, and it collided on port `:8000` with this backend's own uvicorn server during local development. Meanwhile the repo already runs a local GGUF model in-process for receipt OCR (`backend/src/allaroundfood/ocr/`, via `llama-cpp-python`), establishing a working pattern for self-contained, offline model inference without a separate service.

## Decision
- Keep `yt-dlp` to fetch supported video media and metadata, and `ffmpeg` to extract/normalize audio (unchanged from ADR 0002).
- Replace the external `whispr` HTTP service with in-process transcription via whisper.cpp, using the `pywhispercpp` Python package as a project dependency. whisper.cpp ships in the pip wheel — no separate binary is required.
- Select the model by name with `WHISPER_MODEL` (default `base.en`).
- Optionally provision models with `WHISPER_MODELS_DIR`, pointing at a directory holding pre-downloaded ggml `.bin` model files (or where a named model is cached).
- Retire `WHISPR_URL` and the `whispr`/backend port-collision workaround.

## Rationale
Running transcription in-process removes an external service and its `:8000` port collision, keeps the import pipeline offline and self-contained, and mirrors the existing local-GGUF precedent already used by the OCR pipeline (`llama-cpp-python`). `pywhispercpp` is pip-installable and bundles the whisper.cpp runtime in its wheel, so there is no extra binary to install or version. English `.en` models suit English recipe videos and keep the model footprint small (`tiny.en` ≈ 75 MB, `base.en` ≈ 142 MB).

## Consequences
- (positive) Lighter operations: no separate `whispr` service to run, version, or health-check, and the `:8000` port collision is gone.
- (positive) Transcription is fully local/offline; the import path no longer depends on an HTTP service being reachable.
- (tradeoff) A ggml model file (~75–142 MB) must be available at runtime. Model `.bin` files are downloaded on first use from huggingface.co. In network-restricted environments (including CI and some deploys) huggingface.co may be blocked, so the model must be **provisioned as a file** — pre-download the ggml model and point `WHISPER_MODELS_DIR` at it, or run first-use where egress is allowed.
- (tradeoff) Transcription now consumes local CPU time per clip rather than offloading to a separate service.
- `yt-dlp` and `ffmpeg` are still required external binaries; the FastAPI startup hook still logs whether they resolved on PATH.

## Alternatives considered
- `faster-whisper`: capable and fast, but pulls in CTranslate2 and does not match the repo's existing ggml/llama-cpp local-model pattern.
- `openai-whisper`: reuses `torch`, adding a heavy dependency we otherwise do not need for this path.
- Hosted transcription API: rejected to keep transcription offline and avoid per-call cost, privacy, and reliability concerns.
- `pywhispercpp` (chosen): matches the existing ggml/llama-cpp precedent, is pip-installable with the runtime bundled in the wheel, and adds no `torch` dependency.
