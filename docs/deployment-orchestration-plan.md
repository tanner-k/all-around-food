# Deployment Orchestration Plan — all-around-food

> **Audience:** the orchestrator agent (and the human running it) in an
> environment that has **Codex**, network access, and the deploy credentials
> (Vercel, Postgres, OAuth, Anthropic).
>
> **Goal:** take the current Day-1 scaffold to a live, password-gated app for a
> small private group, hosted entirely on Vercel (Next.js API routes + managed
> Postgres), with **every build task reviewed by a Codex subagent** before it
> merges.
>
> This plan is the companion to the architecture plan in
> `/root/.claude/plans/` (summarized in §1). It does **not** itself build
> anything — it tells the orchestrator how to delegate.

---

## 0. How to use this document

The orchestrator runs the **waves** in §5 top to bottom. Within a wave, tasks
marked parallel are delegated simultaneously (each in its own git worktree).
Every build task follows the same lifecycle:

```
delegate build subagent ──► build agent commits in worktree
        │
        ▼
delegate Codex review subagent on that task's diff
        │
   findings? ──yes──► route blocking findings back to the SAME build agent ──► re-review
        │
        no (clean)
        ▼
orchestrator merges worktree branch into the integration branch
```

A task is **Done** only when its Codex review returns no blocking findings AND
the integration branch stays green (`pnpm lint && pnpm build && pnpm test`).

---

## 1. Target architecture (recap)

```
Browser ─► Vercel (Next.js 16, App Router)
             ├─ pages: Plan / Cookbook / Shop / Pantry / Import / Cook
             ├─ route handlers + server actions  ← business logic
             │     └─ Anthropic SDK (recipe import, server-side only)
             ├─ Auth.js (NextAuth v5) — email allowlist
             └─ Drizzle ORM ─► Vercel Postgres (Neon)
```

Single Vercel project, root = `frontend/`. The Python/Polars `backend/` is
retired for v1 (archived, not deleted — its Pydantic models are the schema
source of truth). This supersedes ADR 0001 → **ADR 0002** is task T0.

---

## 2. Roles

| Role | Who | Responsibility |
|---|---|---|
| **Orchestrator** | Claude (this agent, in the full-access env) | Owns the branch, spawns build + review subagents, merges, keeps the integration branch green, drives the build↔review loop, reports status. Writes no feature code itself. |
| **Build subagent** | Claude `general-purpose`, `isolation: worktree` | Implements exactly one task per its brief. Commits in its worktree. Fixes review findings. |
| **Review subagent** | **Codex** (one per build task) | Independently reviews that task's diff against its acceptance criteria + the review checklist (§6). Returns findings with severity. Does not edit code. |

---

## 3. Prerequisites the human must supply (before Wave D)

These gate the *runtime/deploy*, not the code. Provide as env vars / platform
config:

- `DATABASE_URL` — Vercel Postgres / Neon connection string
- `ANTHROPIC_API_KEY` — for the import endpoint
- `AUTH_SECRET` — `openssl rand -base64 32`
- OAuth provider creds (e.g. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`) **or**
  email-magic-link SMTP creds
- `ALLOWED_EMAILS` — comma-separated allowlist
- `NEXTAUTH_URL` / `AUTH_URL` — deployment URL
- Vercel account + project linked to the repo (root `frontend/`)
- Custom domain + DNS (optional, Wave G)

The code must read all of these through `frontend/src/lib/env.ts` and **fail
loudly** if a required one is missing. No secret is ever `NEXT_PUBLIC_*`.

---

## 4. Ground rules for the orchestrator

1. **Branch model.** Integration branch = `claude/app-deployment-planning-mLZ3j`.
   Each build task branches off it as `task/<id>-<slug>` in a worktree. Merge
   back only after Codex sign-off. PRs target `dev`; `dev`→`main` is the
   production release.
2. **Disjoint file ownership.** Each task lists the files/dirs it owns (§5).
   Parallel tasks in the same wave must own **non-overlapping** paths so
   worktree merges are conflict-free. If two tasks need the same file (e.g.
   `package.json`, `db/schema.ts`), serialize them or assign one owner and have
   the other depend on it.
3. **Schema & package.json are single-owner.** `db/schema.ts` is owned by T2;
   later tasks that need new tables request them via T2 or an explicit follow-up
   task. `package.json` deps are added in T1; later tasks assume they exist.
4. **Green gate after every merge.** Orchestrator runs `pnpm install && pnpm
   lint && pnpm build && pnpm test` on the integration branch after each merge;
   a red gate blocks the next wave.
5. **Codex review is mandatory and blocking.** No task merges with an
   unresolved blocking (High/Critical) finding. Med/Low findings are logged as
   follow-up tasks if not fixed inline.
6. **Docs stay in sync.** Any task changing a folder's scope updates its
   `context.md`; `CLAUDE.md` and `AGENTS.md` are edited together (T0 + as
   needed).
7. **Honesty in status.** Report failing gates and skipped steps plainly. Do
   not mark a task Done on a red gate.

---

## 5. Work breakdown — delegatable tasks

Each task = one build subagent + one Codex review subagent. `Owns` = file paths
the build agent may touch. `Dep` = must merge first.

### T0 — Architecture decision + doc reconciliation  *(no runtime deps)*
- **Goal:** Record the all-Vercel decision and fix contradictory docs.
- **Owns:** `docs/decisions/0002-vercel-fullstack.md` (new, supersedes 0001);
  `CLAUDE.md` + `AGENTS.md` (identical edits: §7/§8 single Vercel deploy story,
  Next.js 16 not 15, remove `deploy-ec2.yml` ref, mark shadcn aspirational);
  `README.md` (deploy + stack lines); `data/context.md`, `infra/context.md`,
  `backend/context.md`; archive `backend/` → `backend/_legacy/` (keep models).
- **Acceptance:** ADR 0002 Accepted/supersedes-0001; CLAUDE.md == AGENTS.md; no
  reference to non-existent workflows; no `__PLACEHOLDER__` tokens.

### T1 — Tooling & config baseline  *(Dep: T0)*
- **Goal:** Add all deps, env validation, scripts, Vercel config so later tasks
  have their imports available.
- **Owns:** `frontend/package.json` (+lockfile); `frontend/src/lib/env.ts`
  (new, zod-validated); `.env.example` (new, all vars from §3); `vercel.json`;
  `frontend/vitest.config.ts`, `frontend/playwright.config.ts`; tsconfig paths.
- **Adds deps:** `drizzle-orm drizzle-kit @vercel/postgres`, `next-auth@beta`
  (Auth.js v5) `@auth/drizzle-adapter`, `zod`, `vitest @testing-library/react`,
  `@playwright/test`, optionally `shadcn`/`class-variance-authority`.
- **Acceptance:** `pnpm install && pnpm build` green with empty scaffolding;
  `pnpm test` runs (0 tests OK); env.ts throws on a missing required var.

### T2 — Data layer (Drizzle + Postgres)  *(Dep: T1)*
- **Goal:** Schema, client, migrations, seed.
- **Owns:** `frontend/src/db/` — `schema.ts`, `client.ts`, `migrations/`,
  `seed.ts`; `frontend/drizzle.config.ts`.
- **Schema:** port `backend/_legacy/src/allaroundfood/models.py` →
  `recipes`, `ingredients`, `steps`; add `users`/auth-adapter tables,
  `meal_plans`, `shopping_list_items`, `pantry_items`.
- **Acceptance:** `drizzle-kit generate` produces migrations; seed inserts a
  sample recipe; a round-trip query test passes against a test DB (or
  pglite/`pg-mem` for CI).

### T3 — Auth (Auth.js + allowlist)  *(Dep: T2)*
- **Goal:** Gated sign-in for the allowlist.
- **Owns:** `frontend/src/auth.ts`, `frontend/middleware.ts`,
  `frontend/src/app/(auth)/signin/page.tsx`, `app/api/auth/[...nextauth]/route.ts`.
- **Acceptance:** unauthenticated `(app)/*` → redirect to sign-in; only
  `ALLOWED_EMAILS` may complete sign-in; sessions persist via Drizzle adapter.

### T4 — API client + CRUD handlers  *(Dep: T2; parallel with T3)*
- **Goal:** Typed data access for recipes / plan / shop / pantry.
- **Owns:** `frontend/src/lib/api.ts`; `frontend/src/app/api/{recipes,plan,shop,pantry}/**`
  (route handlers / server actions). **Does not** touch `db/schema.ts`.
- **Acceptance:** each resource has list/create/update/delete; components never
  fetch directly (per `frontend/context.md`); zod-validated inputs.

### T5 — Claude recipe import  *(Dep: T2, T4; use the `claude-api` skill)*
- **Goal:** URL/text/screenshot → structured `Recipe` → persisted.
- **Owns:** `frontend/src/app/api/recipes/import/route.ts`,
  `frontend/src/lib/anthropic.ts` (prompt + tool-use schema, **prompt caching**
  on the system prompt, model `claude-sonnet-4-6`).
- **Acceptance:** given a recipe URL, returns validated structured output and
  persists via T4; key is server-side only; handles parse failures gracefully.

### T6 — Page buildout  *(Dep: T4, T5)*
- **Goal:** Replace the 5 stub pages with real UI.
- **Owns:** `frontend/src/app/(app)/{plan,cookbook,shop,pantry,import}/page.tsx`
  + co-located components under `frontend/src/components/`. Reuse `SectionHeader`
  and the `globals.css` tokens (`terra`, `ink-soft`, `paper`, `line`).
- **Acceptance:** import → save → appears in Cookbook → assign in Plan → rolls
  into Shop; Pantry CRUD works; matches the Cookbook App Flow design.

### T7 — Cook mode  *(Dep: T4; parallel with T5)*
- **Goal:** Step-by-step cook view.
- **Owns:** `frontend/src/app/(app)/cook/[id]/page.tsx` + components.
- **Acceptance:** renders ordered steps for a recipe with hands-free navigation.

### T8 — Tests  *(Dep: T5, T6, T7)*
- **Goal:** Unit + E2E coverage.
- **Owns:** `frontend/src/**/*.test.ts(x)`, `frontend/e2e/**`.
- **Acceptance:** Vitest covers api client, import parser, shopping-list
  derivation; Playwright smoke: sign in (mocked) → import → cookbook → plan →
  shop. Fulfills the open TODO E2E item.

### T9 — CI/CD + deploy  *(Dep: T8)*
- **Goal:** Automated checks + Vercel deploy.
- **Owns:** `.github/workflows/ci.yml` (add test + `drizzle-kit` check),
  `.github/workflows/deploy.yml` or Vercel Git-integration config; migration-on-
  deploy step.
- **Acceptance:** PR → Vercel **preview** deploy; `main` → production; CI green.

### T10 — Hardening  *(Dep: T5, T6)*
- **Goal:** Production safety.
- **Owns:** rate-limit middleware for `/api/recipes/import`, security headers,
  central error/logging, final zod guards; domain/DNS notes in `infra/context.md`.
- **Acceptance:** import endpoint rate-limited; headers set; no unhandled errors
  leak secrets.

---

## 6. Codex review protocol (per task)

For each build task, after the build agent commits, delegate a **Codex review
subagent** with:

1. **The diff:** `git diff <integration>..task/<id>-<slug>` (or the worktree
   path + base SHA).
2. **The task's acceptance criteria** (copied from §5).
3. **The review checklist** below. Codex returns findings as
   `SEVERITY | file:line | issue | suggested fix`, where SEVERITY ∈
   {Critical, High, Med, Low}. **Critical/High block the merge.**

**Checklist (tailor per task):**
- *Correctness:* does it meet the acceptance criteria; edge cases; error paths.
- *Security:* no secret in client bundle / `NEXT_PUBLIC_*`; auth actually
  enforced on protected routes & handlers; input validation; SSRF on the import
  URL fetch; SQL/injection via Drizzle params; rate-limit present where required.
- *Next.js App Router:* server vs client component boundaries; no server-only
  code leaking to client; route handler conventions; caching/revalidation sanity.
- *Data integrity:* schema matches the ported models; migrations reversible;
  FK/constraints; no destructive migration on deploy.
- *Reuse & simplicity:* uses `SectionHeader`, tokens, existing helpers; no dep
  duplication; components don't fetch directly (use `lib/api.ts`).
- *Tests:* meaningful coverage for the task's logic; not just snapshots.

**Loop:** orchestrator forwards blocking findings to the same build subagent →
build agent fixes → Codex re-reviews the new diff → repeat until clean → merge.

---

## 7. Execution waves (dependency order)

| Wave | Tasks (parallel within wave) | Gate before next wave |
|---|---|---|
| A | **T0** ∥ **T1** | `pnpm build` green; ADR 0002 present |
| B | **T2** | migrations generate; round-trip test passes |
| C | **T3** ∥ **T4** | auth redirects work; CRUD handlers green |
| D | **T5** ∥ **T7** | import returns structured recipe; cook renders |
| E | **T6** | full user flow works locally |
| F | **T8** ∥ **T10** | tests green; endpoint hardened |
| G | **T9** | preview deploy succeeds; CI green |

Each cell = build subagent → Codex review → merge, per §0.

---

## 8. Integration & end-to-end verification (orchestrator, after Wave F)

1. `pnpm install && pnpm lint && pnpm build && pnpm test` green on integration
   branch.
2. With real env vars: `pnpm dev` → sign in as an allowlisted user → import a
   recipe by URL → confirm it persists to Postgres and shows in Cookbook →
   assign in Plan → see it in Shop → open Cook mode.
3. Playwright E2E green.
4. No `__PLACEHOLDER__`; `CLAUDE.md` == `AGENTS.md`; ADR 0002 present; README
   deploy story matches reality.

---

## 9. Deployment (human-gated, after Wave G)

1. Human provisions Vercel Postgres/Neon, sets all §3 env vars in Vercel
   (Production + Preview), configures the OAuth app.
2. Open PR → `dev`; verify the **preview** deploy works end-to-end on its URL.
3. Run migrations against the production DB (deploy step or `drizzle-kit migrate`).
4. Merge `dev` → `main` → production deploy.
5. Attach custom domain + DNS (T10 notes); re-verify sign-in + import in prod.
6. Promote shipped TODO lines via `python3 scripts/done.py "…"` and add
   CHANGELOG entries.

---

## 10. Quick-start brief templates (copy-paste for the orchestrator)

**Build subagent brief:**
> You are implementing **task `<ID>`** of the all-around-food deploy. Work only
> in your worktree on branch `task/<id>-<slug>`. **Goal:** `<goal>`. **You own
> only:** `<paths>` — do not modify other files. **Depends on (already merged):**
> `<deps>`. Follow `CLAUDE.md` + the relevant `context.md`. Reuse existing
> helpers/tokens; components must use `lib/api.ts`, never fetch directly. When
> done: ensure `pnpm lint && pnpm build && pnpm test` pass, commit, and report
> the branch + a summary of changes. Then await review findings and fix them.

**Codex review subagent brief:**
> Review the diff `<range>` for task `<ID>` of all-around-food. **Acceptance
> criteria:** `<criteria>`. Apply the review checklist (correctness, security,
> Next.js App Router, data integrity, reuse/simplicity, tests). Return findings
> as `SEVERITY | file:line | issue | fix`. Critical/High are merge-blocking. Do
> not edit code — report only.
