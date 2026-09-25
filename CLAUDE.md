# Project Map — all-around-food

> **`CLAUDE.md` and `AGENTS.md` are identical.** Keep both in sync in the same commit.

## 1. What this project is

A planner-first personal cooking app: a local-first installable PWA for recipes, weekly meal planning, shopping, pantry, and cook mode. Online recipe imports use an owner-gated Supabase queue and a Mac Mini worker. [ADR 0008](docs/decisions/0008-local-first-pwa.md) remains Proposed until the release architecture is reviewed.

## 2. Working and release state

The local `/app` shell and library are implemented. A release is working only after frontend lint, typecheck, unit tests, production build, and PWA browser tests pass; backend ruff, mypy, and full pytest pass; CI passes on the release candidate; hosted Supabase migration and owner policy are verified; the existing library is copied and checked without deleting originals; and a real installed iPhone/iPad and desktop pass offline and update checks. Local test success does not imply those external gates passed. See [the release record](docs/testing/local-first-pwa-release.md).

## 3. Project map

```text
all-around-food/
├── README.md                 local run, backup, and verification
├── CLAUDE.md / AGENTS.md     identical agent context
├── TODO.md / CHANGELOG.md   open work / shipped work
├── frontend/                 Next.js PWA, IndexedDB repository, backup, UI; see context.md
├── backend/                  FastAPI legacy utilities and private import worker; see context.md
├── data/                     legacy Parquet data and archives; see context.md
├── supabase/                 additive owner-gated import migration and SQL tests
├── infra/worker/             Mac LaunchAgent template and installer; see infra/context.md
└── docs/                     architecture, decisions, plans, testing
```

## 4. Where to do what

| Work | Location | Read first |
|---|---|---|
| Local UI, IndexedDB, PWA | `frontend/` | `frontend/context.md` |
| Import worker or legacy API | `backend/` | `backend/context.md` |
| Legacy Parquet | `data/` | `data/context.md` |
| Hosted import schema | `supabase/` | `supabase/README.md` |
| Mac worker install | `infra/worker/` | `infra/context.md` |
| Architecture decision | `docs/decisions/` | latest ADR |

## 5. Global skills / MCPs

- Jev classification with local transcription/OCR for recipe imports (no Anthropic calls)
- ui-ux-pro-max for UI components
- mgrep for search when available; otherwise `rg`

Folder-specific conventions live in each `context.md`.

## 6. Workflow rules

1. `dev` is staging; `main` is release. PRs target `dev`; `dev` → `main` is a release. Branch protection is currently absent on both remote branches and remains a release preflight decision.
2. Keep open work as `- [ ]` in `TODO.md`. Only when a task is shipped, run `python3 scripts/done.py "description"` to promote it to `CHANGELOG.md`.
3. Update a folder's `context.md` when its scope changes. Add an ADR for architectural decisions; leave ADR 0008 Proposed until review.
4. Husky pre-commit runs Prettier and ESLint through lint-staged. Do not bypass hooks.
5. CI must pass before merge: frontend lint, typecheck, unit, production build, PWA Chromium; backend ruff, mypy, pytest including pricing; canon sync.
6. Edit `CLAUDE.md` and `AGENTS.md` together and keep them byte-identical.
7. Preserve the old cloud library and Parquet archives during migration. Do not merge the conflicting destructive PR #10 migration with the additive import migration before checking actual hosted migration history.

## 7. Deployment

There is no GitHub deployment workflow. Vercel serves https://all-around-food.vercel.app/app from `main` (PR #12, commit `19145a53c5e06dfea06f26e0328fe760c96a5418`). Hosted Supabase project `pkvdoucwssyjltvqsxcq` has migrations `0001`–`0005` and an existing single owner. The Mac Mini runs LaunchAgent `com.allaroundfood.worker` from its Python 3.12 virtualenv, polling every 30 seconds after login and FileVault unlock. Vercel holds only public Supabase URL/anon configuration; Jev and service-role keys stay in the Mac's mode-600 environment. Physical iPhone/iPad, sleep/crash recovery, and cloud-library copy remain unverified; see `docs/testing/local-first-pwa-release.md`.

## 8. Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, IndexedDB through `idb`
- Backend: Python 3.12, FastAPI, Polars, private import worker
- Hosted import coordination: Supabase Auth, Postgres queue/RPCs, temporary Storage
- Infra: Vercel target and a personal Mac Mini worker
- Package manager: pnpm 10; Node 22
