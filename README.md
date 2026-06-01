# all-around-food

> A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and a hands-on cook mode.

## Stack
- **Frontend / API:** Next.js 16 + TypeScript + Tailwind CSS v4 (route handlers + server actions for business logic)
- **Data:** Postgres via Drizzle ORM (Vercel Postgres / Neon)
- **Auth:** Auth.js (NextAuth v5) — email-allowlist
- **Infra:** Vercel (single deploy; Git integration)

## Install
```bash
pnpm install
```

## Develop
```bash
pnpm dev
```

## Test
```bash
pnpm test
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
- Deploy: push to `main` → Vercel Git integration (production); PRs → Vercel preview deploys
