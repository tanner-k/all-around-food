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

**Step 1: Configure environment**

Copy the env template and add your API key:
```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local and paste your Anthropic API key:
# ANTHROPIC_API_KEY=sk-ant-...
```

**Step 2: Start the backend (Terminal A)**

```bash
cd backend
uv sync
uv run python -m allaroundfood
```

FastAPI will start on http://localhost:8000. Check health: `curl http://localhost:8000/healthz`

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
