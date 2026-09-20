# TODO

> Active work. New tasks go here as `- [ ] description`.  
> When a task is complete, **either** check it off and run `python3 scripts/done.py "description"`, **or** move the line manually to `CHANGELOG.md` under today's date.

Completed historical phase notes live in `CHANGELOG.md`.

## Phase D (Next)
- [ ] Real E2E import test: sign in, enqueue, run the Mac worker, review the draft, and save it locally
- [ ] Configure Vercel Git integration for the PWA (`dev` staging, `main` production)
- [ ] Validate the native Mac LaunchAgent and `python -m allaroundfood.worker --watch`

## Supabase cutover follow-ups
- [ ] Inspect hosted migration history, then apply `0004_evaluation_stats.sql` and `0005_local_recipe_drafts.sql` in order

## Audit follow-ups — Video recipe parsing
> Pipeline is code-complete; these make it actually runnable.
- [ ] Install + document `ffmpeg` and `yt-dlp` for dev/deploy (`ffmpeg` is not a Python package)
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
- [ ] Real responsive mobile layout (current is desktop-first)
- [ ] Background eval re-runs when worker prompt changes (auto re-grade historical parses)
- [ ] TikTok / video import source
- [ ] Email recipe forwarding
- [ ] Manual recipe entry form
- [ ] Deploy to production

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
