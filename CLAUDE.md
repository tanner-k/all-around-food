# Project Map — all-around-food

> **`CLAUDE.md` and `AGENTS.md` are identical.** Keep both in sync — update in the same commit.  
> This file is the entry-point for any AI agent working in this repo.

## 1. What this project is
A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## 2. Working state
A project is "working" when **all** of the following are true:

- Visual shell matches the Cookbook App Flow design (typography, palette, top nav order)
- `pnpm lint && pnpm build && pnpm test` green
- CI green on dev branch
- No remaining `__PLACEHOLDER__` tokens

> Default if unsure: `pnpm lint` clean · `pnpm test` green · `dev` branch deploys to staging without error · no `- [x]` lines linger in `TODO.md` (they should have been promoted to `CHANGELOG.md`).

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
│       └── ci.yml             ← every PR (deploy via Vercel Git integration)
├── .husky/                ← git hooks
│   └── pre-commit             ← lint-staged
├── scripts/
│   └── done.py            ← promotes TODO line → CHANGELOG entry
├── frontend/              ← UI + API routes + business logic · see context.md
├── backend/
│   ├── context.md         ← explains the archive; read before touching backend/
│   └── _legacy/           ← archived Python/Polars backend (schema reference)
├── data/                  ← schemas, migrations, seeds · see context.md
├── infra/                 ← Vercel config notes · see context.md
└── docs/
    ├── context.md
    ├── architecture.md
    └── decisions/         ← one ADR per architectural decision
        ├── 0001-stack.md
        └── 0002-vercel-fullstack.md
```

## 4. Where to do what
| If you're working on... | Go to... | Read first |
|---|---|---|
| UI component, page, route | `frontend/` | `frontend/context.md` |
| API endpoint, business logic | `frontend/src/app/api/` or server actions | `frontend/context.md` |
| Schema, migration, seed | `frontend/src/db/` | `data/context.md` |
| Vercel / deploy config | `infra/` | `infra/context.md` |
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
Deployment is via **Vercel Git integration**: pushing to `main` triggers a production deploy; PRs get preview deploys automatically. No separate deploy workflow is needed for the frontend.

- The `frontend/` directory is the Vercel project root.
- API routes and server actions deploy as Vercel serverless functions alongside the Next.js app.
- A `.github/workflows/deploy.yml` (Vercel CLI-based) is planned for task T9 to enable migration steps on deploy.

## 8. Tech stack
- Frontend: Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui *(shadcn/ui planned — not yet installed)*
- Backend: Next.js route handlers + server actions (TypeScript, server-only)
- Data: Postgres via Drizzle ORM (Vercel Postgres / Neon)
- Auth: Auth.js (NextAuth v5) — email-allowlist
- AI: Anthropic SDK, server-side only (claude-sonnet-4-6)
- Infra: Vercel
- Package manager: pnpm
- Node version: 22
