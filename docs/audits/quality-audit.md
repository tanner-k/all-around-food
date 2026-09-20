# Professional Quality Audit — all-around-food

**Date:** 2026-07-05
**Scope:** the whole repo as it sits on disk today.
**Excluded from grading** (in progress per the current roadmap): the Supabase cutover
(dual-architecture remnants, proxy routes, doc drift covered by cutover W5), deployment,
and worker operational reliability (cron install, keep-alive, model prefetch). Nothing
below penalizes those.

**Overall: B-.** This is a well-architected hobby project wearing some professional
clothes. The decision hygiene (ADRs, plans, context docs) and the backend's type
discipline are better than most production codebases. But the project *verifies almost
none of its frontend*, ships zero user-facing failure states, measures nothing (no
coverage, no bundle size, no a11y checks), and its CI would happily merge a PR that
breaks every React component in the app. A professional project is defined by what it
guarantees, not what it intends — and right now the guarantees are thin.

---

## Grades

| Dimension | Grade | One-line verdict |
|---|---|---|
| Architecture & decision records | A- | Genuinely strong; ADRs with supersession chains |
| Data layer & migrations | A- | Idempotent SQL, RLS everywhere, skip-locked claim RPC |
| Backend code quality | A- | mypy `strict`, docstrings, clean module boundaries |
| Frontend code quality | B+ | Zero `any`, Zod contracts — but nobody's checking |
| Documentation & onboarding | B | Rich, but no LICENSE and no CONTRIBUTING |
| Security | B- | RLS is real; everything else is on trust |
| Release & git hygiene | B- | Good rituals, messy shelf: 9 stale branches, zero tags |
| Dependency hygiene | C+ | Lockfiles, then hope |
| Accessibility | C+ | 45 aria attributes and no way to know if they work |
| CI/CD | C | Half the test suite is decorative |
| Testing | C | Backend carries it; frontend is ~10 files for 8,550 lines |
| Error handling & observability (frontend) | D+ | Not one `error.tsx` in the app |

---

## The critique

### Architecture & decision records — A-
Seven ADRs with explicit supersession links, per-folder `context.md`, dated plans with
acceptance criteria. This is the repo's best quality and it's not close. Docked to A-
because ADR statuses lag reality (0007 still says "Proposed" while its architecture is
half-built) — a decision record that isn't updated at decision time is a diary, not a record.

### Data layer & migrations — A-
`0001_init.sql` is professional work: idempotent DDL, RLS enabled on all 12 tables with
owner policies, money as integer cents, `vector(384)` with an ivfflat index, and a
`for update skip locked` claim RPC so concurrent workers can't double-process. Docked
because there is no migration test — nothing in CI ever applies these files, so a broken
migration is discovered by the next human, and there's no seed script for a fresh dev DB.

### Backend code quality — A-
`mypy strict` over the whole package, 343 tests, real docstrings, retry caps and stale-job
recovery in the queue. Two dents: the ruff rule selection is timid (`E,F,I,UP,B,SIM` — no
`RUF`, no `PL`, no `S`/bandit, no docstring enforcement), and 15 `except Exception`
handlers is a lot of blanket catching even granting the "evals must never fail a job"
design. `worker.py` at 514 lines is one refactor away from being the god-module.

### Frontend code quality — B+
Zero `any`, six Zod schema files as real contracts, components mostly under 300 lines,
only 4 stray `console.*` calls. The grade is capped hard by one fact: **none of this is
verified anywhere.** `pnpm test` exists and CI doesn't run it (see CI/CD). Unverified
quality is provisional quality.

### Documentation & onboarding — B
README with badges, feature list, prerequisites table; `docs/evaluations.md`;
architecture doc; the CLAUDE/AGENTS sync check in CI is a clever touch. But: **no
LICENSE file** — for a public repo this is not a nitpick, it's legally "all rights
reserved" and no professional would touch it; no CONTRIBUTING; and the PR template is the
only `.github` process artifact (no issue templates, no CODEOWNERS).

### Security — B-
The good: RLS on every table and on storage objects, secrets properly gitignored (only
`.env.example` is tracked), no `dangerouslySetInnerHTML`, service-role key confined to
the local worker by design. The unexamined: nothing rate-limits or size-caps `parse_jobs`
inserts and `imports/` uploads (a signed-in user — or a leaked anon key + weak email
gate — can fill your free-tier storage); the worker fetches arbitrary user-supplied URLs
and shells out to `yt-dlp`/`ffmpeg` on their output with no allowlist or timeout audit
trail (acceptable for personal use, but undocumented as a trust boundary); and there is
zero automated scanning — no CodeQL, no `pip-audit`/`pnpm audit`, no secret-scanning
config, no bandit ruleset. Security posture here is "designed once, never checked."

### Release & git hygiene — B-
The rituals are good: husky + lint-staged, conventional-ish commits, PR template, the
TODO→CHANGELOG promotion script. The shelf is a mess: **9 local/remote stale branches**
(`claude/*`, `test-app`, `pr5-conflict-fix`, merged feature branches), work sitting on
`feat/import-queue-worker` unmerged, no tags or release names ever cut, and the changelog
has "Unreleased" phases stacked four deep. `TODO.md` still carries three completed phases
of checked boxes that the repo's own pre-commit hook nags about — the process exists and
is being ignored, which is worse than not having it.

### Dependency hygiene — C+
Lockfiles committed, Node and pnpm versions pinned (with well-commented CI workarounds).
And that's it. No Dependabot/Renovate, no audit step in CI, no update policy. The pnpm-10
pin is exactly the kind of decision that rots silently: nothing will ever prompt anyone
to revisit it.

### Accessibility — C+
45 `aria-*`/`role` usages shows intent, and eslint-config-next's core-web-vitals preset
covers a sliver of jsx-a11y. But there is no dedicated jsx-a11y config, no axe checks in
unit or E2E tests, no documented keyboard-nav or focus-management pass, no
`prefers-reduced-motion` handling found. For an app whose flagship feature is a *cook
mode operated with messy hands* — where voice-over and large-target interaction are core
use cases, not compliance — accessibility is a product feature being treated as decoration.

### CI/CD — C
The backend job is fine (ruff, mypy, pytest) and docs-sync is a nice guard. The frontend
job runs `lint` and `build` — **and never `pnpm test`**. Eleven vitest files and a
Playwright spec exist and are dead weight in CI. There is also: no coverage reporting or
threshold, no concurrency-cancellation (pushes stack up duplicate runs), no dependency or
security scanning, no migration-apply check, and no artifact of any kind. A CI that
doesn't run the tests you wrote is a rubber stamp with extra steps.

### Testing — C
Split verdict. Backend: 35 files, 343 tests, network/slow markers — respectable, though
with `pytest-cov` installed and *never invoked*, nobody can say what those 343 tests
actually cover. Frontend: 10 unit-test files against 8,550 lines — the recipe detail
page, cook mode timer logic, import flow, DropZone, shopping/pantry pages, and every
`lib/db/*` module except `parseJobs` have no tests at all. The single E2E spec is a
navigation smoke test that CI never executes. The test pyramid here is a test obelisk:
one thick backend column and vapor above it.

### Error handling & observability (frontend) — D+
The single worst professional gap in the repo. The Next.js app router contains **zero
`error.tsx`, zero `loading.tsx`, zero `not-found.tsx`, zero `global-error.tsx`** — not
one route segment has a failure or pending state. A Supabase hiccup, an expired session
mid-action, a recipe id that doesn't exist: all of them surface as either a blank hang,
a raw digest error screen, or a silent nothing. There is no error reporting (no Sentry or
equivalent), no client-side logging strategy (4 ad-hoc console calls), and no way for
future-you on a phone to know why the app just ate an import. The worker side is markedly
better (structured logger, attempts, error column on jobs) — which makes the frontend's
bare-handedness look like a choice.

---

## Grade math

Weighted toward what users and collaborators actually hit (testing, CI, error handling
weighted up; architecture docs weighted normal): **B-**. The ceiling of this codebase is
an A — the foundations are real. The floor is what ships today: an app that has never
proven its UI works and goes silent the first time anything fails.

See `quality-audit-improvements.md` for the path from each grade to an A.
