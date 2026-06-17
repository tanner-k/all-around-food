# all-around-food

> A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## Stack
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Python 3.12 + Polars (file-backed; FastAPI planned)
- **Data:** Parquet/CSV in data/ via Polars; migrate to Postgres later
- **Infra:** Vercel

## Install
```bash
pnpm install && cd backend && uv sync
```

## Run Phase B locally

**Prerequisites:**
- Node 22, pnpm, Python 3.12, uv
- An Anthropic API key (get one at https://console.anthropic.com)
- Poppler for receipt PDF OCR (`brew install poppler` on macOS)

**Step 1: Configure environment**

Copy the env template and add your API key:
```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local and paste your Anthropic API key:
# ANTHROPIC_API_KEY_PARSING=sk-ant-...
```

> The key is named `ANTHROPIC_API_KEY_PARSING` (not `ANTHROPIC_API_KEY`) on
> purpose — a project-specific name can't be shadowed by a global
> `ANTHROPIC_API_KEY` exported in your shell, which Next.js would otherwise
> prioritize over `.env.local`.

**Step 2: Start the backend (Terminal A)**

```bash
cd backend
uv sync
uv run python -m allaroundfood
```

FastAPI will start on http://localhost:8000. Check health: `curl http://localhost:8000/healthz`

> **Video transcription (local whisper.cpp):** the Instagram/TikTok video
> importer transcribes speech in-process via whisper.cpp (`pywhispercpp`) — no
> separate service to run. Configure it with:
>
> - `WHISPER_MODEL` — model name (default `base.en`). English `.en` models suit
>   English recipe videos. Footprint: `tiny.en` ≈ 75 MB, `base.en` ≈ 142 MB.
> - `WHISPER_MODELS_DIR` (optional) — directory of pre-downloaded ggml `.bin`
>   model files, or where a named model is cached.
>
> On first use the ggml model is downloaded from huggingface.co. In
> network-restricted environments (including CI and some deploys) huggingface.co
> may be blocked, so **provision the model as a file**: pre-download the ggml
> model and point `WHISPER_MODELS_DIR` at it, or run first-use where egress is
> allowed.
>
> The startup log will warn if `yt-dlp` or `ffmpeg` aren't resolvable on PATH.

**Step 3: Start the frontend (Terminal B)**

```bash
cd frontend
pnpm install
pnpm dev
```

Next.js will start on http://localhost:3000.

**Step 4: Import a recipe**

- Open http://localhost:3000/import
- Drop a recipe screenshot or paste a recipe URL (e.g., https://www.nytimes.com/recipes/...)
- You'll see parsing progress, then a review screen with extracted title, ingredients, and steps
- Click **Save** to add it to your cookbook

**Step 5: Check how Claude graded it**

- Visit http://localhost:3000/evaluations (dev dashboard)
- See the eval stats and a table of recent parses with overall/accuracy/completeness grades
- Expand a row to read judge strengths/weaknesses and field-level feedback

**Troubleshooting**

If `pnpm install` warns about build scripts, run:
```bash
pnpm approve-builds
```

For pricing adapter Playwright fallbacks, install Chromium once:
```bash
cd backend
uv run playwright install chromium
```

For real offline receipt OCR, download the local Qwen2-VL GGUF model and export its path:
```bash
bash scripts/download_qwen.sh
export QWEN_GGUF_PATH="$HOME/.cache/allaroundfood/qwen2-vl-7b-instruct-q4_k_m.gguf"
```

## Develop
```bash
pnpm dev
```

## Test
```bash
pnpm test && cd backend && uv run pytest
```

## Build
```bash
pnpm build
```

## CLI
_No CLI commands yet._

## Recent updates
Last 5 entries from [CHANGELOG.md](./CHANGELOG.md):

<!-- BEGIN:RECENT-UPDATES -->
- (auto-populated by `scripts/done.py` once you ship something)
<!-- END:RECENT-UPDATES -->

## Project map
See [CLAUDE.md](./CLAUDE.md) (identical to [AGENTS.md](./AGENTS.md)) for the agent-readable map of this repo.

## Workflow
- Branches: `main` (prod, protected) ← `dev` (staging) ← `feature/*`
- Pre-commit: Prettier + ESLint via Husky
- CI: every PR runs lint / typecheck / test / build
- Deploy: push to `main` → `.github/workflows/deploy-ec2.yml`
