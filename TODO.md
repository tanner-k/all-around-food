# TODO

> Active work. New tasks go here as `- [ ] description`.  
> When a task is complete, **either** check it off and run `python3 scripts/done.py "description"`, **or** move the line manually to `CHANGELOG.md` under today's date.

Completed historical phase notes live in `CHANGELOG.md`.

## Phase D (Next)
- [ ] Real E2E smoke test with Playwright: sign in, enqueue import, run worker once, confirm recipe appears
- [ ] Configure Vercel Git integration for the PWA (`dev` staging, `main` production)
- [ ] Configure a local/cron worker runbook for `python -m allaroundfood --once`

## Supabase cutover follow-ups
- [ ] Document applying `supabase/migrations/0004_evaluation_stats.sql` in the local setup checklist

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
