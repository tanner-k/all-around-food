# Local-first PWA release record

**Updated:** 2026-09-25

**Production revision:** `19145a53c5e06dfea06f26e0328fe760c96a5418` (`main`, PR #12)

**Decision:** production deployment and a real owner import were observed; the full release gate remains open for physical-device, recovery, and library-copy checks.

## Observed production rollout (2026-09-25)

| Area | Observed result | Limit |
|---|---|---|
| Merge and deployment | PR #11 merged to `dev`; PR #12 merged to `main` at the revision above. All eight checks passed. Vercel reported a successful production deployment at https://all-around-food.vercel.app/app. | PR #13's installer fix passed all five checks and merged to `dev`; production promotion follows. |
| Hosted Supabase | Project `pkvdoucwssyjltvqsxcq` received migrations `0001`–`0005` only after private schema/data snapshots and a disposable rehearsal. The rehearsal left all existing rows and original columns unchanged: 5 recipes, 5 meal plans, 10 planned meals, 4 evaluations, and 1 pending job. The hosted recipe count remains 5. An existing single owner was configured. | The old cloud library has not yet been copied into the production browser profile. Preserve hosted originals and private snapshots. |
| Mac Mini worker | The `.worktrees/mac-import-worker` checkout uses Python 3.12, a mode-600 `backend/.env`, Jev, CPU-only `small.en`, Tesseract, and `RUN_EVALS=false`. LaunchAgent `com.allaroundfood.worker` is running with the corrected virtualenv path and polls every 30 seconds after login. | Sleep, crash, and lease-recovery behavior on this Mac has not yet been observed. |
| Real production Chrome import | A pasted recipe queued offline survived a full offline reload. Reconnection submitted an owner-scoped row to hosted Supabase. The browser disconnected again while the Mac worker returned a Jev draft with 3 ingredients and 4 steps. Reconnection received and acknowledged the local draft; editing, Save to cookbook, and full recipe reload then passed offline in installed Chrome automation, without mocked services. | This is browser automation, not a physical iPhone/iPad test. A prior website import could not access its source and returned a useful error; that source is not evidence of website-import success. |

No credential, owner UUID, magic-link token, or private snapshot is recorded here.

## Earlier local candidate checks (2026-09-20)

| Area | Observed result | Limit |
|---|---|---|
| Local storage, backup, planner, shopping, cook mode | Focused frontend suites passed in Task 1/2/3/5 reports. Task 5's final focused run: 7 files, 43 tests; TypeScript and targeted ESLint passed. | IndexedDB tests use browser simulation; they do not establish installed-device durability. |
| Import queue and review | Task 6 tests and isolated SQL fixture passed. Task 8 final focused UI/import run: 3 files, 36 tests; TypeScript and targeted ESLint passed. | Mocked Supabase/worker; no hosted owner policy, real service, or external recipe was tested. |
| Production PWA | On the merged candidate with the final fixes: fixture production build passed (35 precached URLs) and `pnpm test:pwa` passed 4/4 (offline restart, failed/accepted update, import review and Save, planning/shopping/pantry). | Chromium only. No physical home-screen or iOS installation test. |
| Backend | Full `pytest -q -rs` in the worktree with the original backend virtualenv and `PYTHONPATH` set to this worktree's `backend/src`: 523 passed, 4 skipped. Ruff and configured mypy passed 68 source files. The real embedding test fetched its model into a task temp cache. | Skips cover reportlab, Qwen weights, Kroger credentials, and live video. No live import, Supabase, or Mac worker run. |
| Mac installer | Task 9's installer suite passed 7 black-box tests; shell syntax and plist lint passed. | No real Mac installation or launchd observation. |
| Supabase SQL | Against a disposable local PostgreSQL fixture with synthetic owner/other users: `supabase/tests/local_recipe_drafts.sql` passed on a fresh `0001`-`0005` database, and the new `supabase/tests/legacy_import_upgrade.sql` passed — pre-upgrade `processing` rows are requeued and claimable with a fresh lease, exhausted ones fail visibly, and completed legacy results and recipes are untouched. | Hosted Supabase Auth, Storage, policies, and migration history were not tested. A bare PostgreSQL harness must also grant `service_role` table access, which hosted Supabase grants by default. |
| Final review fixes | Frontend lint, TypeScript, and 28 files / 178 unit tests passed, including new regressions for repeated manual recipe creation, restored-draft Save on a fresh profile, two cook views converging without echo writes, and corrected amounts never reusing the old number. | Browser-simulated IndexedDB; not proof of installed-device behaviour. |
| Merged backend | Ruff and configured mypy passed 68 source files; the restored API, storage, pricing, OCR and worker suites passed 153 tests / 2 skips. | Full-suite evidence (523 passed, 4 skipped) is reused from the unchanged backend; no live import, Supabase, or Mac worker run. |
| Retired inline parsing | Task 10 route regressions check 410 for direct recipe and receipt parsing; the frontend Claude module was removed. | Legacy API client helpers remain in unmounted screens; personal `/app` does not use them. |

The candidate CI workflow added frontend lint, TypeScript, non-watch Vitest, production build, Chromium installation, and PWA tests with public fixture `https://aaf-mock.supabase.co` / `public-test-key`. Backend Ruff, mypy, and full pytest—including pricing—remained separate; canon sync remained. A green GitHub run on draft PR #11 was observed before the production rollout above.

## Remaining release checks

1. Promote the merged PR #13 installer fix and this rollout record through `dev` to `main`. The live LaunchAgent already uses the corrected virtualenv path.
2. Copy the preserved cloud library into the intended browser profile using owner-only export and local merge restore. Compare counts and representative contents, then download a local backup. Keep hosted originals and Parquet archives intact.
3. Test a real iPhone/iPad home-screen installation and a desktop installation at the production origin, including offline cold launch, editing, cooking progress, planning, shopping, restore, and update behavior. Chromium simulation does not establish iOS behavior.
4. Exercise Mac sleep/offline, process crash, and lease reclaim with recoverable jobs; test an accessible website and public video source separately. Record source access and timing rather than assuming universal support.
5. Verify hosted owner/other/anonymous and Storage security cases, and disable public sign-ups before inviting users. The queue is already restricted to the configured owner.
6. Resolve the failing Supabase Keepalive workflow or consciously retire it. Keep ADR 0008 Proposed until architecture review, and leave the local-first TODO open until the remaining gates pass.

## Backup and device boundaries

`/app#/settings` downloads a version 1 JSON backup of recipes, meal plans, shopping, pantry, drafts, cooking progress, and settings. Pending import upload blobs are excluded. Merge restore keeps existing IDs; replace restore requires a pre-restore backup and explicit confirmation. Each browser profile, device, and origin has separate IndexedDB. A backup is a manual transfer, not sync. Browser data clearing or device loss can remove local edits; recovery requires a previously saved backup. Avoid changing the production origin after data is local without an explicit transfer plan.

## Release disposition

The frontend is deployed and the hosted queue-to-Mac-to-local-draft path worked in production Chrome. Cloud-library copy, physical-device checks, and Mac recovery remain open. The release TODO remains open and no `scripts/done.py` promotion to `CHANGELOG.md` is warranted yet.
