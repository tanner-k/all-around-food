# all-around-food

> A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

[![CI](https://github.com/tanner-k/all-around-food/actions/workflows/ci.yml/badge.svg)](https://github.com/tanner-k/all-around-food/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org/)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue)](https://python.org/)

---

## Features

- **Weekly meal planner** — drag recipes into a 7-day grid, swap days, and plan the week in minutes.
- **AI recipe import** — paste a URL or drop a screenshot; the app enqueues a parse job and the worker saves the recipe when it finishes.
- **Smart shopping list** — recipe-sourced and manual items, grouped by aisle, with checked items flowing back into pantry stock.
- **Pantry inventory** — track what you have on hand and what is running low.
- **Cook mode** — guided step-by-step or full-scroll cooking views, with post-cook pantry status updates.
- **Video recipe import** — import from Instagram or TikTok via yt-dlp, ffmpeg, and local whisper.cpp transcription.
- **Receipt OCR** — local Qwen2-VL GGUF receipt parsing for the pricing/OCR pipeline.
- **Grocery price tracking** — pricing adapters, canonical product matching, and analytics live under `backend/src/allaroundfood/pricing/`.
- **Eval dashboard** — review how Claude graded recipe imports for accuracy and completeness.

---

## Screenshots

> Drop screenshots or a demo GIF here once the UI is stable.

---

## Getting Started

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node | 22 | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | `npm i -g pnpm` |
| Python | 3.12 | [python.org](https://python.org/) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Poppler | any | `brew install poppler` (macOS) · `apt install poppler-utils` (Linux) |
| Docker Desktop | latest | Required for the scheduled local worker |

You also need:

- A Supabase project with the migrations in `supabase/migrations/` applied.
- An Anthropic API key for worker-side recipe parsing and evaluation.
- `yt-dlp` and `ffmpeg` on `PATH` for video imports (`brew install yt-dlp ffmpeg` on macOS).
- A local model directory for the scheduled worker, mounted into Docker at `/models`.

### Install

```bash
pnpm install
cd backend && uv sync && cd ..
```

### Configure Environment

Create `frontend/.env.local` with the public Supabase browser values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Backend and worker env lives in `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Fill in at least:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL for migration scripts and the worker. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key for migration scripts and the worker; never expose it to the frontend. |
| `ANTHROPIC_API_KEY_PARSING` | Yes | Anthropic API key used by the local worker for parsing and evals. |
| `WHISPER_MODEL` | No | Local whisper.cpp model name; defaults to `base.en`. |
| `YTDLP_BIN` / `FFMPEG_BIN` | No | Video import binaries; default to `yt-dlp` and `ffmpeg`. |
| `QWEN_GGUF_PATH` | No | Real receipt OCR model path. |

Apply Supabase migrations and migrate existing Parquet rows using [supabase/README.md](./supabase/README.md).

### Run

**Terminal A — frontend**

```bash
cd frontend
pnpm dev
```

Next.js starts on `http://localhost:3000`.

**Terminal B — worker**

```bash
cd backend
uv run python -m allaroundfood.worker --once
```

Use `--watch` while developing if you want the worker to poll continuously.

Before relying on the worker, run the preflight checks and prefetch local models:

```bash
cd backend
uv run python -m allaroundfood.worker --doctor
uv run python -m allaroundfood.worker --prefetch-models
```

`--prefetch-models` may download the configured Whisper model on first use. The Qwen GGUF receipt model is not committed; put it in the host model directory that Docker mounts at `/models`:

```bash
mkdir -p "$HOME/models/allaroundfood/whisper"
bash scripts/download_qwen.sh "$HOME/models/allaroundfood/qwen2-vl.gguf"
```

For launchd/Docker, set `QWEN_GGUF_PATH=/models/qwen2-vl.gguf` and `WHISPER_MODELS_DIR=/models/whisper` in `backend/.env`.

### Schedule the Worker on macOS

launchd is the supported local scheduler. Build the worker image, prepare a model directory containing `qwen2-vl.gguf` and a `whisper/` subdirectory, then install the LaunchAgent:

```bash
docker build -f backend/Dockerfile.worker -t allaroundfood-worker backend
infra/worker/install_launchd.sh --models "$HOME/models/allaroundfood"
launchctl load "$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
launchctl start com.allaroundfood.worker
launchctl print "gui/$(id -u)/com.allaroundfood.worker"
tail -f /tmp/allaroundfood-worker.out /tmp/allaroundfood-worker.err
```

To reload after editing the plist:

```bash
launchctl unload "$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
launchctl load "$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
```

To uninstall:

```bash
launchctl unload "$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
rm "$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
```

### Try It Out

1. Sign in through the PWA.
2. Go to `/import`, paste a recipe URL or drop a screenshot, and add it to the queue.
3. Run the worker once; the finished recipe appears in `/cookbook`.
4. Plan meals in `/plan`, review the shopping list in `/shop`, and check parse grades in `/evaluations`.

---

## Development

### Run

```bash
# Frontend (hot reload)
cd frontend && pnpm dev

# Worker (single drain)
cd backend && uv run python -m allaroundfood.worker --once
```

### Test

```bash
# Frontend unit tests (Vitest)
cd frontend && pnpm test

# Frontend E2E tests (Playwright)
cd frontend && pnpm test:e2e

# Backend (pytest)
cd backend && uv run pytest
```

### Lint & Typecheck

```bash
# Frontend
cd frontend && pnpm lint

# Backend
cd backend && uv run ruff check && uv run mypy
```

### Build

```bash
cd frontend && pnpm build
```

---

## Architecture

```
Browser / PWA
  └─▶ Next.js 16 (frontend/)
        ├─▶ Supabase Postgres + Storage
        └─▶ local API routes for still-hosted frontend features

Local worker (backend/)
  └─▶ Supabase parse_jobs
        ├─▶ Claude recipe parsing + evals
        ├─▶ yt-dlp + ffmpeg + whisper.cpp video transcription
        └─▶ Qwen2-VL receipt OCR / pricing observations
```

**Key subsystems**

| Subsystem | Path | What it does |
|-----------|------|--------------|
| Supabase data access | `frontend/src/lib/db/` | Server-side reads/writes under RLS |
| Import queue | `frontend/src/lib/db/parseJobs.ts`, `backend/src/allaroundfood/worker.py` | Enqueues and drains recipe parse jobs |
| Recipe parsing | `backend/src/allaroundfood/parsing/` | Claude tool-use parsers and judge |
| Video import | `backend/src/allaroundfood/video_import.py` | yt-dlp fetch, ffmpeg audio, whisper.cpp transcription |
| Receipt OCR | `backend/src/allaroundfood/ocr/` | Qwen2-VL GGUF receipt parsing |
| Pricing | `backend/src/allaroundfood/pricing/` | Retailer adapters, canonical matching, analytics |

---

## Troubleshooting

**`pnpm install` warns about build scripts**

```bash
pnpm approve-builds
```

**Video import cannot find system binaries**

Install `yt-dlp` and `ffmpeg`, or set `YTDLP_BIN` / `FFMPEG_BIN` in `backend/.env`.

```bash
YTDLP_BIN=/path/to/yt-dlp FFMPEG_BIN=/path/to/ffmpeg uv run python -m allaroundfood.worker --once
```

**Whisper model download is blocked**

Run `uv run python -m allaroundfood.worker --prefetch-models` on a network that can reach Hugging Face, or pre-download a ggml model and set `WHISPER_MODELS_DIR`.

**Pricing adapter Playwright fallbacks need Chromium**

```bash
cd backend && uv run playwright install chromium
```

**Offline receipt OCR needs Qwen2-VL**

```bash
mkdir -p "$HOME/models/allaroundfood/whisper"
bash scripts/download_qwen.sh "$HOME/models/allaroundfood/qwen2-vl.gguf"
```

When running locally without Docker, set `QWEN_GGUF_PATH` to that host path. When running through Docker/launchd, mount the host model directory at `/models` and set `QWEN_GGUF_PATH=/models/qwen2-vl.gguf`.

---

## Contributing

1. Branch off `dev`: `git checkout -b feature/your-thing dev`.
2. Open a PR targeting `dev`; `main` is release-only.
3. CI must be green before merge.
4. `dev` → `main` is a release.

See [CHANGELOG.md](./CHANGELOG.md) for shipped work and [TODO.md](./TODO.md) for open work.

## Recent Updates

Last 5 entries from [CHANGELOG.md](./CHANGELOG.md):

---
<!-- BEGIN:RECENT-UPDATES -->
- Text shopping list to any number via Apple Messages
<!-- END:RECENT-UPDATES -->

## Project Map

See [CLAUDE.md](./CLAUDE.md), which is identical to [AGENTS.md](./AGENTS.md), for the agent-readable repo map.
