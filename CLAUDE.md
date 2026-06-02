# Project Map — all-around-food

> **`CLAUDE.md` and `AGENTS.md` are identical.** Keep both in sync — update in the same commit.  
> This file is the entry-point for any AI agent working in this repo.

## 1. What this project is
A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## 2. Working state
A project is "working" when **all** of the following are true:

- Visual shell matches the Cookbook App Flow design (typography, palette, top nav order)
- Polars stub layer reads/writes data/recipes.parquet
- `pnpm lint && pnpm build` green
- `uv run ruff check && uv run mypy && uv run pytest` green
- CI green on dev branch
- No remaining `__PLACEHOLDER__` tokens

> Default if unsure: `npm run lint` clean · `npm test` green · `dev` branch deploys to staging without error · no `- [x]` lines linger in `TODO.md` (they should have been promoted to `CHANGELOG.md`).

## 3. Project map
```
all-around-food/
├── README.md              ← what the project is + how to run it
├── CLAUDE.md              ← this file (AI agent context)
├── AGENTS.md              ← identical copy of CLAUDE.md
├── TODO.md                ← open work; check off + promote when done
├── CHANGELOG.md           ← shipped work, newest first
├── .editorconfig          ← editor defaults
├── .prettierrc            ← format rules
├── .eslintrc.json         ← lint rules
├── .gitignore
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml             ← every PR
│       └── deploy-ec2.yml     ← on push to main
├── .husky/                ← git hooks
│   └── pre-commit             ← lint-staged
├── scripts/
│   └── done.py            ← promotes TODO line → CHANGELOG entry
├── frontend/              ← UI · see context.md
├── backend/               ← API + business logic · see context.md
│   └── src/allaroundfood/
│       ├── pricing/       ← Grocery price tracking adapters, canonical product matching, analytics (see docs/plans/grocery-price-tracking.md)
│       └── ocr/           ← Receipt OCR pipeline (Qwen2-VL GGUF). Independent of any pantry receipt-import flow. Writes to data/receipts.parquet + PriceObservation rows.
├── data/                  ← schemas, migrations, seeds · see context.md
├── infra/                 ← terraform, deploy scripts · see context.md
└── docs/
    ├── context.md
    ├── architecture.md
    └── decisions/         ← one ADR per architectural decision
        ├── 0001-stack.md
        ├── 0002-video-recipe-import.md
        ├── 0003-grocery-pricing-scope.md       ← personal-use + unofficial adapter gate
        ├── 0004-canonical-product-matching.md  ← local embeddings (bge-small-en-v1.5)
        └── 0005-pricing-storage.md             ← Parquet-first; Postgres migration triggers
```

## 4. Where to do what
| If you're working on... | Go to... | Read first |
|---|---|---|
| UI component, page, route | `frontend/` | `frontend/context.md` |
| API endpoint, business logic | `backend/` | `backend/context.md` |
| Schema, migration, seed | `data/` | `data/context.md` |
| Terraform, deploy script | `infra/` | `infra/context.md` |
| Architecture decision | `docs/decisions/` | latest ADR |
| Workflow / process question | `CLAUDE.md` (here) | this file |

## 5. Global skills / MCPs
Apply across the whole repo:

- claude-api (for recipe parsing via Anthropic SDK)
- ui-ux-pro-max (design tokens + components)
- mgrep (search)

> Folder-specific skills live in each `context.md`.

## 6. Workflow rules
1. **Branches:** `main` = prod (protected). `dev` = staging. All PRs target `dev`. `dev` → `main` is a release.
2. **TODOs:** Add as `- [ ] …` in `TODO.md`. When complete, run `python3 scripts/done.py "description"` — it removes the line from `TODO.md` and appends it to `CHANGELOG.md` under today's date.
3. **Docs first:** When you change a folder's scope, update its `context.md`. When you make an architectural decision, add an ADR in `docs/decisions/`.
4. **Format on commit:** Husky pre-commit runs Prettier + ESLint via `lint-staged`. Do not bypass with `--no-verify`.
5. **CI green to merge:** Every PR must pass `.github/workflows/ci.yml` (lint + typecheck + test + build).
6. **Identical canon:** If you edit `CLAUDE.md`, copy the same change to `AGENTS.md` (and vice versa) in the same commit.

## 7. Deploy
Pushes to `main` trigger `.github/workflows/deploy-vercel.yml`:
- Deployed to Vercel (frontend auto-deploys on push to main)
- Backend API deployed separately (see infra docs)

## 8. Tech stack
- Frontend: Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui
- Backend: Python 3.12 + Polars (file-backed; FastAPI planned)
- Data: Parquet/CSV in data/ via Polars; migrate to Postgres later
- Infra: Vercel
- Package manager: pnpm
- Node version: 22
