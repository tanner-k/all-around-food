# Cookbook list and editing — current app

Onigiri AAF-5 corrects the initial implementation in the obsolete root checkout.
The current application is the local-first `/app` screen, based on account-sync
commit `d20798e`. Worktree: `.worktrees/cookbook-current-app`; branch:
`codex/cookbook-current-app`.

The cookbook now has alphabetical recipe names, lifetime made counts, direct Edit
links, and right-side letter buttons. Letter jumps scroll without replacing the
URL hash used by the application router. Add recipe and Import remain available.
The editor has a top Save changes button, associated labels, notes/storage fields,
pending-save protection, visible errors, and fractional-duration support.
Local save callbacks retain the original optimistic-concurrency baseline,
ingredient amount normalization, blank-field filtering, and step renumbering.

The current source also had a pre-existing Next route build error: `/api/export`
declared an optional Request parameter. It now requires Request, matching Next's
route contract; the four no-query unit calls now supply a Request. Authentication,
owner restrictions, and export behavior are unchanged.

## Initial local preview verification

- Full Vitest: 45 files / 373 tests passed. Focused additions cover the cookbook
  and local editor; existing route and app navigation assertions were updated to
  use exact title links and accessible input labels.
- Independent integration review found no defects in hash navigation, account
  boundaries, baseline preservation, amount normalization, or failure handling.
- Actual in-app browser on `http://localhost:3001/app#/cookbook`: added labeled
  sample recipes, marked one cooked, renamed it from A to Z, saved notes/storage,
  reloaded, and observed the renamed recipe with its count preserved. A/Z buttons
  kept the URL at `#/cookbook`. This exercised actual local IndexedDB persistence.
- This local preview has cloud sync off and a separate sample library. No hosted
  recipes, auth settings, migrations, or deployments were changed.

- Lint, TypeScript, production webpack build, and generated 62-URL PWA manifest
  passed. Webpack was used with the existing dependency installation shared from
  the account-sync worktree; no dependency or lockfile changes were required.
- All three production offline/update browser tests passed, including offline
  recipe editing and persistence across restart and update.
- The separate mocked import browser test reached its initial sync readiness
  assertion and failed because this preview is built with account sync `off`.
  Its recipe-stage cloud flow was not verified; this is a local-only preview.
- The existing middleware/Edge-runtime warnings remain. No commit, push, or
  deployment was performed.

## Production release candidate

Onigiri AAF-6 tracks the user-authorized production release. The candidate is
integrated onto `origin/dev` at `ec31a20` in `.worktrees/cookbook-release`, branch
`codex/cookbook-release`. Production preflight identified `cb155d4` as the live
commit, which includes newer premium UI changes than the initial preview's
`d20798e` base. Those changes are retained, including theme tokens, title
transitions, sync status, and the current editor controls. The cookbook loading
skeleton now also uses the name-list layout.

Safari at the existing production origin displayed 19 saved recipes and
“Up to date” before release. No database migration, environment change, library
copy, reset, or sample-data upload is part of this release. The normal GitHub
`dev` → `main` / Vercel integration supplies production configuration; the local
preview's sync-off setting is not included in the source.

Release CI and deployment outcomes are tracked in the GitHub pull requests and
Onigiri AAF-6. Local and Chromium checks do not establish physical iOS behavior.
