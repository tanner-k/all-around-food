# TODO

> Active work. New tasks go here as `- [ ] description`.  
> When a task is complete, **either** check it off and run `python3 scripts/done.py "description"`, **or** move the line manually to `CHANGELOG.md` under today's date.

Completed historical phase notes live in `CHANGELOG.md`.

## Phase D (Next)

- [ ] Configure Vercel Git integration for the PWA (`dev` staging, `main` production)
- [ ] Validate the native Mac LaunchAgent and `python -m allaroundfood.worker --watch`

## Audit follow-ups — Video recipe parsing

> Pipeline is code-complete; these make it actually runnable.

- [ ] Pre-fetch whisper model (`base.en` GGML) in worker provisioning
- [ ] Add skippable end-to-end video-import test (`@network`/`@slow`)

## Audit follow-ups — Shopping list upload

- [ ] Worker: add a `shopping_list_image` parse-job kind that parses uploaded images into shopping-list items
- [ ] Frontend: `ShoppingListImportFlow` component + upload entry on `/shop`; extend `DropZone` with a `"shopping-list"` variant
- [ ] Supabase: write parsed shopping-list items through `frontend/src/lib/db/shopping.ts` or a worker-side insert helper
- [ ] Tests for shopping-list parse schema + worker job handling

## Audit follow-ups — Shopping list store comparison

> Pricing library is retained, but the user-facing pricing surface is deferred.

- [ ] Write a pricing Supabase/pgvector migration plan
- [ ] Move pricing stores from Parquet to Supabase when the future pricing plan is approved
- [ ] Restore a user-facing price comparison surface after pricing data is queryable from Supabase
- [ ] Validate ≥1 adapter end-to-end against live data (start with Kroger official API)
- [ ] Implement Playwright fallbacks (currently `NotImplementedError`) for walmart/costco/whole_foods/instacart locations + search
- [ ] Costco: confirm promo field + membership flag; Instacart: `source_retailer` tagging; Costco ZIP→geocoding in `locations/resolver.py`
- [ ] Add Costco adapter test

## Later

- [ ] Background eval re-runs when worker prompt changes (auto re-grade historical parses)
- [ ] Email recipe forwarding

## Icebox

- [ ] (ideas that aren't on the roadmap yet)

## Local-first PWA — implementation in progress, release pending

- [ ] Implement the local-first installable PWA and Mac Mini import loop
  - Plan: [Downloadable Local-First Cooking App](docs/superpowers/plans/2026-09-19-local-first-pwa.md)
  - [ ] Integrate `origin/dev` while retaining the backend/pricing suite and resolving the `0004` migration collision; inspect hosted migration history before applying SQL
  - [ ] Obtain green CI on the merged release candidate, including production Chromium PWA tests and the separate backend/pricing checks
  - [ ] Verify owner-only Supabase setup and additive migration in a disposable hosted project; stop the old worker before protocol cutover
  - [ ] Copy and verify the existing cloud library into the target browser without deleting originals or Parquet archives
  - [ ] Verify the Mac Mini worker, live website and accessible Instagram imports, and blocked-source fallback
  - [ ] Verify an installed iPhone/iPad and desktop through offline cold launch, edits, cooking, plans, shopping, backup restore, and app update
  - [ ] Confirm the stable production origin, deployment, branch checks, and recovery/rollback procedure before promoting this item to `CHANGELOG.md`

## Account sync — narrowed recipe release and deferred expansion

- [ ] Verify and release recipe/import account sync with real offline/online proof — [reduced release plan](docs/superpowers/plans/2026-09-26-recipe-sync-release.md)
- [ ] Finish cooking history/session/count sync after recipe sync is proved — [preserved work and follow-ups](docs/plans/account-sync-followups.md)
- [ ] Verify planning/shopping/pantry integration before enabling all-stage — [follow-ups](docs/plans/account-sync-followups.md)
- [ ] Add advanced account backup/history/conflict restoration and source-draft enrollment — [follow-ups](docs/plans/account-sync-followups.md)

## Premium UI — shipped to `main` 2026-09-29; device checks and follow-ups open

- [ ] Verify on an installed iPhone/iPad:
  - status bar and safe areas;
  - Screen Wake Lock (iOS 18.4+);
  - sticky actions above the tab bar;
  - VoiceOver on the sync chip and checkboxes;
  - no input zoom;
  - light/dark `theme-color`.

  Each plan's "Needs a device" list has the details.

- [ ] Plan 02 phase 2: optional recipe photos (device-only first; ADR before any cloud sync)
- [ ] Small follow-ups from implementation notes:
  - `Menu` should flip up when there is no room below.
  - DropZone emoji pills.
  - Optionally strengthen the secondary `Button` border.
