# Raising the Grades — improvement plan

**Date:** 2026-07-05
**Companion to:** [`quality-audit.md`](./quality-audit.md)
**Excluded:** Supabase cutover, deploy, worker operational reliability (in progress).
Ordered by grade-per-hour: cheap fixes to bad grades first.

---

## 1. Error handling & observability: D+ → B+ (highest leverage in the repo)

- Add `frontend/src/app/(app)/error.tsx` and `global-error.tsx` (friendly retry UI),
  `not-found.tsx` (root + `/cookbook/[id]`), and `loading.tsx` for every data-fetching
  segment (`(app)`, `cookbook/[id]`, `plan`, `shop`, `pantry`, `import`, `evaluations`).
  This is ~10 small files and eliminates the worst failure modes in one PR.
- Standardize mutation failures: every `lib/db/*` write path returns a typed error;
  surface via one shared `<Toast>`/inline-error component instead of silent catches.
- Add Sentry (free tier) to the PWA — one init file + the error boundaries above report
  automatically. Tag releases with the git SHA so phone failures are debuggable.
- Handle expired-session mid-action: on Supabase `401`, redirect to `/login?next=…`
  rather than letting the write vanish.
- **B+ → A:** add offline detection (the PWA will be used in grocery stores) and a
  queued-retry pattern for shopping-list checks.

## 2. CI/CD: C → A-

One PR to `.github/workflows/ci.yml`:

- Add `pnpm test -- --run` to the frontend job (the single biggest fix in this plan —
  it turns 11 existing test files back on).
- Add a Playwright job (`pnpm exec playwright install --with-deps chromium && pnpm test:e2e`)
  against `next start`; keep it required once stable.
- Add coverage: `vitest --coverage` + `pytest --cov=allaroundfood --cov-fail-under=70`
  (pytest-cov is already installed). Ratchet the threshold up, never down.
- Add `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
- Add a migrations job: run `supabase start`-less validation via
  `psql`-against-postgres:16 service container applying `supabase/migrations/*.sql`
  in order — catches broken SQL before a human does.
- **A- → A:** upload build + coverage artifacts; add a nightly workflow for `@slow`
  marked tests.

## 3. Testing: C → B+

- Frontend priorities, in order of blast radius: `lib/db/shopping.ts` (424 lines,
  0 tests, money/dedupe logic), `lib/shopping-logic.ts`, `RecipeEditForm`, `CookMode`
  step/timer transitions, `DropZone` kind-routing, and one render test per page shell.
  Target: every `lib/**` module tested, every page has at least a smoke render.
- Grow e2e from the navigation spec to the three core loops (mock Supabase or use a
  seeded local instance): sign-in → browse recipe → cook mode; enqueue import → queue
  view reflects status; plan week → generate shopping list.
- Backend: turn on coverage (see CI) and fill whatever `worker.py` dispatch branches it
  exposes as untested; add one test per `except Exception` site proving the swallow is
  intentional (job errors, eval never fails a parse).
- **B+ → A:** contract tests asserting Zod schemas ↔ Pydantic models ↔ SQL columns stay
  in sync (a drift here is the likeliest future prod bug).

## 4. Security: B- → A-

- Enable GitHub free tooling (near-zero effort): Dependabot alerts, secret scanning +
  push protection, CodeQL default setup for TS + Python.
- Add `S` (bandit) to ruff's select; add `pnpm audit --prod` and `uv run pip-audit`
  as non-blocking CI steps, blocking after triage.
- Abuse caps on the free tier: Postgres constraints or policies limiting `parse_jobs`
  rows per user per day and a storage-object size cap on `imports/` (Supabase bucket
  file-size limit setting — one dashboard/config change).
- Document the trust boundary in a short `docs/security.md`: worker fetches
  user-supplied URLs and runs yt-dlp/ffmpeg — single-user by design; note timeouts and
  what would need hardening before multi-user.
- **A- → A:** validate `storage_path` prefix (`{user_id}/…`) in the worker before
  download, so a mis-inserted row can't make the service-role client fetch another
  user's object.

## 5. Accessibility: C+ → B+

- Add `eslint-plugin-jsx-a11y` (strict config) to `eslint.config.mjs`; fix what it flags.
- Add `vitest-axe` assertions to existing component tests + an `@axe-core/playwright`
  pass in the e2e job — automated a11y becomes a regression gate, not an aspiration.
- Manual pass on the two flagship surfaces: cook mode (large tap targets, works with
  screen reader, timer announcements via `aria-live`) and shopping list (checkbox
  semantics, focus not lost after check-off).
- Respect `prefers-reduced-motion` in any transition/animation utilities.
- **B+ → A:** keyboard-only walkthrough of import → review → save documented in the PR
  that fixes what it finds.

## 6. Dependency hygiene: C+ → B+

- Add `.github/dependabot.yml`: weekly, grouped minor/patch for `frontend` (npm),
  `backend` (uv/pip), and `github-actions`. With CI actually running tests (item 2),
  auto-PRs become safe to merge.
- Add a dated re-evaluation note to the pnpm-10 pin comment ("revisit when
  eslint-config-next supports pnpm 11") so the pin has an exit condition.

## 7. Release & git hygiene: B- → A-

- Delete the stale branches: local `claude/*`, `pr5-conflict-fix`, `test-app`, merged
  `feat/*` remotes; enable GitHub's "automatically delete head branches."
- Land or close `feat/import-queue-worker` (`b298f4d`) — unmerged work rots.
- Clear the pre-commit nag: promote lingering `- [x]` TODO lines via `scripts/done.py`.
- Start tagging: `git tag v0.1.0` at the next `dev` → `main` merge; convert
  `CHANGELOG.md` "Unreleased" stacks into versioned sections at each tag.
- Enable branch protection on `main` and `dev` (require CI, require PR).

## 8. Documentation & onboarding: B → A-

- Add `LICENSE` (MIT unless you have reasons) — five minutes, removes the biggest
  professional red flag in the repo.
- Add a short `CONTRIBUTING.md` (branch model, done.py ritual, CLAUDE/AGENTS sync rule —
  mostly links into CLAUDE.md) and `.github/ISSUE_TEMPLATE/` bug + feature forms.
- Flip ADR statuses at decision time: 0007 → Accepted now; add a one-line "Status
  changed" note with date. Make "ADR status current" a PR-template checkbox.

## 9. Backend code quality: A- → A

- Widen ruff: add `RUF`, `PL`, `S`, `C4`, `PT`, `D` (Google style, tests exempt) —
  fix or explicitly `noqa`-with-reason what it finds.
- Split `worker.py` (514 lines): `worker/dispatch.py` (per-kind handlers),
  `worker/evals.py`, `worker/cli.py`. Pure mechanical move; tests already exist.
- Audit the 15 `except Exception` sites: each either narrows its exception type or
  gains a comment + test asserting the swallow is intentional.

## 10. Frontend code quality: B+ → A

- Mostly earned via items 2–3 (verification is the cap on this grade).
- Add `pnpm typecheck` (`tsc --noEmit`) as an explicit CI step so type safety doesn't
  ride on `next build`'s behavior.
- Split `lib/db/shopping.ts` (424 lines) into queries vs list-building logic; the logic
  half becomes trivially unit-testable.

## 11. Data layer & migrations: A- → A

- Covered by the CI migrations job (item 2).
- Add `supabase/seed.sql` (a few recipes, a meal plan, pantry items) so a fresh clone +
  local Supabase reaches a usable app in one command; document in README.

## 12. Architecture & decision records: A- → A

- Covered by item 8's ADR-status ritual. Nothing else needed — this is already the
  repo's strength.

---

## Suggested sequencing (grade-per-hour)

| Order | Work | Effort | Grades moved |
|---|---|---|---|
| 1 | CI: enable vitest + coverage + concurrency (item 2 core) | ~1 h | CI/CD C→B, unlocks others |
| 2 | Error/loading/not-found boundaries + Sentry (item 1) | ~½ day | D+→B+ |
| 3 | LICENSE + Dependabot + GitHub security toggles + branch cleanup (8, 6, 4, 7) | ~1 h | three C/B- grades → B+ |
| 4 | Frontend test fill: lib/db + core components (item 3) | ~2 days | Testing C→B |
| 5 | Playwright core loops + migrations CI job | ~1 day | Testing→B+, CI→A- |
| 6 | a11y plugin + axe gates + cook-mode pass (item 5) | ~1 day | C+→B+ |
| 7 | ruff widening + worker split + tags/branch protection | ~1 day | A- tier → A |

Items 1–3 are a single afternoon and move five grades. Full plan ≈ one focused week,
landing the overall grade from **B-** to **A-**.
