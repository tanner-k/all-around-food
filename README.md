# all-around-food

> A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

[![CI](https://github.com/tanner-k/all-around-food/actions/workflows/ci.yml/badge.svg)](https://github.com/tanner-k/all-around-food/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-22-brightgreen)](https://nodejs.org/)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue)](https://python.org/)

---

## Features

- **Weekly meal planner** — drag recipes into a 7-day grid, swap days, and plan the week in minutes
- **AI recipe import** — paste a URL or drop a screenshot; Claude extracts the title, ingredients, and steps and asks you to review before saving
- **Smart shopping list** — auto-generated from your meal plan, grouped by aisle, with manual add/remove
- **Pantry inventory** — track what you have on hand; checked items are crossed off the shopping list automatically
- **Cook mode** — step-by-step guided view or full-scroll layout with ingredient highlights
- **Video recipe import** — import from Instagram or TikTok via yt-dlp + Whisper speech-to-text
- **Receipt OCR** — scan a grocery receipt with the local Qwen2-VL GGUF model; no cloud API required
- **Grocery price tracking** — compare prices across Walmart, Costco, Kroger, Whole Foods, and Instacart with canonical product matching powered by local bge-small-en-v1.5 embeddings
- **Eval dashboard** — review how Claude graded each recipe import (accuracy, completeness, field-level feedback)

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

You also need an **Anthropic API key** for recipe parsing — get one at [console.anthropic.com](https://console.anthropic.com).

### Install

```bash
pnpm install
cd backend && uv sync && cd ..
```

### Configure environment

```bash
cp frontend/.env.local.example frontend/.env.local
```

Open `frontend/.env.local` and fill in the values:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY_PARSING` | Yes | Anthropic API key used for recipe import and receipt review. Named with a project suffix so it can't be shadowed by a global `ANTHROPIC_API_KEY` in your shell. |
| `BACKEND_URL` | No | FastAPI base URL — defaults to `http://localhost:8000`. Change if you move the backend to a different port. |
| `WHISPR_URL` | No | Speech-to-text service URL — defaults to `http://localhost:8000`. Used only for video recipe import. |

### Run

**Terminal A — backend**

```bash
cd backend
uv run python -m allaroundfood
```

FastAPI starts on `http://localhost:8000`. Verify: `curl http://localhost:8000/healthz`

**Terminal B — frontend**

```bash
cd frontend
pnpm dev
```

Next.js starts on `http://localhost:3000`.

### Try it out

1. **Import a recipe** — go to `/import`, paste a URL or drop a screenshot, review the extracted fields, and click **Save**
2. **Plan the week** — go to `/plan` and drag your new recipe into the meal grid
3. **Generate a shopping list** — visit `/shop`; the list auto-populates from your plan
4. **Grade an import** — go to `/evaluations` to see accuracy and completeness scores from the Claude judge

---

## Development

### Run

```bash
# Frontend (hot reload)
cd frontend && pnpm dev

# Backend (auto-reload)
cd backend && uv run python -m allaroundfood
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

### Lint & typecheck

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
Browser
  └─▶ Next.js 15  (frontend/)       — pages, API proxy routes, shadcn/ui components
        └─▶ FastAPI  (backend/)      — business logic, Polars file store, ML pipelines
              └─▶ Parquet / CSV  (data/)   — recipes, meal plans, pantry, price observations
```

**Key backend subsystems**

| Subsystem | Path | What it does |
|-----------|------|--------------|
| Pricing adapters | `backend/src/allaroundfood/pricing/` | Scrapes/calls Walmart, Costco, Kroger, Whole Foods, Instacart |
| Canonical matching | `pricing/canonical/` | Deduplicates products with bge-small-en-v1.5 embeddings + RapidFuzz |
| Receipt OCR | `backend/src/allaroundfood/ocr/` | Runs Qwen2-VL GGUF locally; writes `data/receipts.parquet` |
| Video import | `backend/src/allaroundfood/video_import.py` | yt-dlp fetch → ffmpeg audio → Whisper transcription |

---

## Troubleshooting

**`pnpm install` warns about build scripts**

```bash
pnpm approve-builds
```

**Port collision between the backend and `whispr`**

Both services default to `:8000`. If you're using the video importer:

```bash
# Option A — move this backend to :8001, leave whispr on :8000
PORT=8001 uv run python -m allaroundfood
# then set BACKEND_URL=http://localhost:8001 in frontend/.env.local and restart pnpm dev

# Option B — move whispr to another port, keep this backend on :8000
WHISPR_URL=http://localhost:8088 uv run python -m allaroundfood
```

The startup log will warn if `yt-dlp` or `ffmpeg` aren't found on PATH.

**Pricing adapter Playwright fallbacks**

Install Chromium once:

```bash
cd backend && uv run playwright install chromium
```

**Offline receipt OCR (Qwen2-VL)**

Download the local model and export its path:

```bash
bash scripts/download_qwen.sh
export QWEN_GGUF_PATH="$HOME/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf"
```

---

## Contributing

1. Branch off `dev`: `git checkout -b feature/your-thing dev`
2. Open a PR targeting `dev` — **never target `main` directly**
3. CI must be green (lint + typecheck + test + build) before merge
4. `dev` → `main` is a release; only maintainers merge that

See [CHANGELOG.md](./CHANGELOG.md) for what's shipped and [TODO.md](./TODO.md) for open work.

---

## License

MIT — see [LICENSE](./LICENSE) (file to be added).
