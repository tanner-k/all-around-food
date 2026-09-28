# 02 — Recipe imagery: typographic cards, then optional photos

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** [03 — Design tokens and UI primitives](./03-design-tokens-and-primitives.md) (`Card`, color/radius/shadow tokens)

## Goal

Replace the permanent empty image blocks on the cookbook grid and recipe detail with a typographic treatment (Phase 1, no data change). Separately, scope an optional recipe photo as a later phase without touching the live `recipes` account-sync stage.

## Current state

- `Recipe` has no image field: `frontend/src/lib/recipe-schema.ts:51-75` — no `image`/`photo_url` key.
- Cookbook grid card, `frontend/src/components/app/LocalScreens.tsx:87-89`: `<div className="aspect-video bg-paper-2" />` followed by title + `"N× cooked"`/`"just added"` only — no cuisine, time, servings, or description, despite those fields existing on `Recipe`.
- Recipe detail hero, `frontend/src/components/recipe/RecipeDetail.tsx:111`: `<div className="w-full rounded-xl bg-paper-2" style={{ aspectRatio: "16/10" }} />` between title (`:104-108`) and meta pills (`:114-120`).
- A third, previously unlisted site with the same pattern: `frontend/src/components/recipe/RecipeReview.tsx:110` (post-import review screen), same layout shape as the detail hero.
- No `<img>`/`next/image` anywhere in `frontend/src`. No co-located test exists for `RecipeDetail.tsx` or `RecipeReview.tsx`; nothing asserts on the placeholder markup, so Phase 1 is additive to coverage, not a break-and-fix.
- Original intent (`docs/design/screens-chosen.jsx`) used a shared `Photo` component with real thumbnails everywhere: 1×1 suggestion cards, a 4×5 detail hero (`:129`), a hero card in the cookbook grid (`:100`), a 16×9 import-review preview (`:374`); `docs/design/chat-history.md:120-122` confirms photography was part of the chosen direction from the start. The layout shipped, the imagery didn't — this plan closes that gap in two steps.

## Scope and non-goals

**Phase 1:** typographic fallback for the cookbook grid, recipe detail, and (opportunistically) import review — a deterministic, pure-CSS "cover" tint + serif initial using only existing tokens (`paper-2`, `terra-soft`, `forest-soft`, `warn-soft`) or ones plan 03 adds; no new token invented here.

**Phase 2:** a written investigation and phased recommendation for an optional photo — capture, storage, compression, backup, and sync impact. No code ships from Phase 2.

**Non-goals:** AI-generated photography, a photo gallery view, cropping UI, changes to the import worker's OCR pipeline.

## Design — Phase 1

**Cookbook grid card** (`LocalScreens.tsx:86-89`, desktop 2-col / mobile 1-col, grid classes unchanged):
- Remove the placeholder block entirely.
- Optional generated cover, `aspect-video`: a tint from a small deterministic set plus a large centered serif initial — a flat colored tab, not photo chrome.
- Body: serif title (unchanged), new meta line `cuisine · total time · servings` (same `total_time_min ?? cook_time_min` fallback as `RecipeDetail.tsx:47`), italic description when present (`line-clamp-2`), then the unchanged cooked-count line — protected by the plan-set README's e2e-selector list. Keep the `index === 0` `border-2 border-terra` highlight as-is.

**Recipe detail header** (`RecipeDetail.tsx:104-120`): same generated cover at `aspect-[16/10]` in place of `:111`, via one shared component so tint/initial logic isn't duplicated.

**Shared `RecipeCover` component** — new `frontend/src/components/recipe/RecipeCover.tsx` (+ co-located test), props `{ recipe: Pick<Recipe, "title" | "cuisine" | "course">; className?: string }`:
- Tint: hash `cuisine ?? course ?? title` (trivial char-code hash, no dependency) into one of `["bg-terra-soft", "bg-forest-soft", "bg-warn-soft"]` — same recipe always renders the same tint.
- Initial: first character of `title.trim()`, uppercased, `font-serif`, centered. Prefer `text-ink-soft` for the glyph over all three tints rather than per-tint colors, to avoid a same-hue-on-same-hue contrast problem with `terra` on `terra-soft`.
- No `<img>`, no network — consistent with "no new Supabase/FastAPI calls in the `/app` client import tree."

## Implementation steps — Phase 1

1. Add `RecipeCover.tsx` + test (needs plan 03's tokens; confirm landing order).
2. `LocalScreens.tsx:87-89` — swap in `<RecipeCover recipe={item} className="aspect-video" />`, add the meta line + description. Test asserting the meta format and unchanged cooked-count copy.
3. `RecipeDetail.tsx:111` — swap in the cover at `aspect-[16/10]`. Add `RecipeDetail.test.tsx` (none exists) covering the cover plus existing action handlers.
4. `RecipeReview.tsx:110` — same swap, own commit so it can be dropped without blocking 2-3.
5. Visual check at both grid breakpoints and phone width; run `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`.

Suggested split: steps 1-3 one PR, step 4 a follow-up.

## Phase 2 investigation — optional recipe photo

**Source.** `RecipeEditForm.tsx` has no file input today; `DropZone.tsx:154-156, 27-37` has the `<input type="file" accept="image/*">` + `FileReader` pattern to imitate (its `onImage` feeds a vision parse, not a recipe field — a pattern, not a reusable component). Worker side: `backend/src/allaroundfood/worker.py:216-278` downloads a screenshot, OCRs it (`parsing/recipe_parser.py:303-323`), and publishes only the parsed `Recipe` JSON — **the source image is discarded**, uploads cleaned after a drain cycle (`worker.py:1-6`). URL/video imports never have an image. So near-term the only source is a **client-side file/camera picker on the edit form**; worker-retained screenshots are real but separate backend scope (own migration — Phase 2d).

**Storage as a Blob.** `db.ts:9` `DB_VERSION = 2`; `recipes` stores the whole `Recipe` value (`db.ts:14,109`). A `Blob` must **not** live inside that object: `backup.ts:97-102` `JSON.stringify`s the snapshot (a `Blob` serializes to `{}`, silently dropped); the replace-mode safety check at `backup.ts:143` compares `JSON.stringify` of before/after libraries (defeated the same way); the sync codec (`sync-codecs.ts:22`, `RecipeSchema.parse` over `jsonb`, `0006_library_sync.sql:9`) can't carry a `Blob` either. Recommendation: a separate store, `recipe_photos: { recipe_id: Blob + metadata }`, added via `if (oldVersion < 3) { db.createObjectStore("recipe_photos", { keyPath: "recipe_id" }); }`, `DB_VERSION` → `3`. `Recipe` is unchanged, mirroring `cook_progress`/`drafts` as separate stores keyed by id, so photos are device-local by construction.

**Resize/compress.** No existing canvas utility. New `frontend/src/lib/local/photo.ts`: `createImageBitmap(file)` → draw to an off-screen canvas capped at ~1600px long edge → `convertToBlob({ type: "image/webp", quality: 0.82 })`, targeting ~150-400KB/photo, JPEG fallback if WebP encode is unavailable.

**Backup format.** `backup.ts:16-21,32-37` (`BackupEnvelope`, `version: 1`) only covers `storeNames` (`:10`); `recipe_photos` is deliberately excluded, so `version: 1` backups are untouched — but that means **photos are not covered by Settings backup/restore** under the device-only design; a device wipe loses them even though recipe text survives. Closing that gap means bumping `BackupEnvelope` to `version: 2` with base64 photo entries (real size/complexity growth), or treating cloud sync as the backup path instead. Recommend punting on backup coverage for the first PR and saying so explicitly in Settings copy.

**Account sync codecs/outbox.** `NEXT_PUBLIC_ACCOUNT_SYNC_STAGE` defaults to `"recipes"` on Vercel builds (`next.config.ts:5`) — recipes sync is live in production today. `sync-codecs.ts:22` validates payloads with `RecipeSchema.parse`; the server gate `app_private.valid_library_payload` (`0006_library_sync.sql:65-102`) checks required keys are **present** (`p ?& array[...]`, `:73-75`) but has no closed-key-set check, so an optional marker field would likely pass validation. Passing validation isn't enough, though; see the note after the phasing list for why 2a adds no marker at all.

**iOS size/quota.** Installed home-screen PWAs on iOS Safari (this app's install target per `ADR 0008`) have smaller, more eviction-prone per-origin storage than desktop, and eviction can take the whole origin's IndexedDB with it, not just photos. `frontend/context.md` already flags physical iPhone/iPad testing as unverified — a second, independent reason to keep photos off by default until verified. Mitigate with aggressive compression, photos deletable independent of the recipe, and (once sync exists) `recipe_photos` treated as a rebuildable cache, not the sole copy of truth.

**Recommended phasing:**
1. **2a (device-only):** file picker + compression + `recipe_photos` store + `DB_VERSION: 3`. Photo presence is a lookup in the local `recipe_photos` store by recipe ID; the `Recipe` record gains **no** field, so nothing photo-related enters the sync outbox. Document "not backed up yet" in Settings. Touches no `supabase/` file; cannot regress the live recipes-sync stage.
2. **2b (backup coverage):** `BackupEnvelope` → `version: 2` with photo entries, once 2a has shipped.
3. **2c (cloud sync via Storage):** new `recipe-photos` bucket + migration, `storage_path` field on the synced payload, outbox handling for in-flight uploads — only after the other `NEXT_PUBLIC_ACCOUNT_SYNC_STAGE=all` collections prove out the pattern; `frontend/context.md` already treats full rollout as its own integration gate, and photos shouldn't jump ahead of it.
4. **2d (optional):** worker retains and publishes the source screenshot as an initial photo — backend-only, independent of 2a-2c.

**Why no synced `has_photo` marker in 2a.** A marker on the synced `Recipe` would tell other devices a photo exists when its bytes never left this one. Older clients' `RecipeSchema.parse` strips unknown keys and re-uploads, so the flag would flip back and forth between devices. And it edits a live synced record for no benefit. A synced reference (Storage path, content hash) belongs to 2c, designed with its ADR.

**ADR required?** Per `CLAUDE.md` workflow rule 3: 2a is not architectural — an additive local IndexedDB store, consistent with the `cook_progress`/`drafts` pattern; no ADR needed. 2c is architectural — a new Storage bucket, a new synced-field shape, and a durable-vs-temporary Storage distinction that doesn't exist today — **recommend a new ADR before starting 2c**, not an amendment to `ADR 0008` (stays Proposed pending the broader release review).

**Service-worker/offline.** `frontend/context.md`: the production service worker precaches `/app` and assets, not Supabase responses. A `recipe_photos` Blob store needs no SW change — it's local IndexedDB, offline by construction, read via `URL.createObjectURL`. The only offline risk is Phase 2c: a synced photo not yet downloaded to this device needs network, so its UI should fall back to the Phase 1 `RecipeCover` rather than a broken image — cheap, since `RecipeCover` already exists after Phase 1.

## Tests and verification (Phase 1)

- New `RecipeCover.test.tsx`: deterministic tint, initial rendering, empty `cuisine`/`course` fallback.
- New `RecipeDetail.test.tsx`: cover renders; `onMarkCooked`/`onDelete`/`onStartCook` still wire up; pills/breadcrumb unaffected.
- New/extended cookbook-card test: meta-line format, description shown only when present, cooked-count copy unchanged.
- `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`. No physical-device check needed for Phase 1.

## Risks and open questions

- The initial glyph's contrast (`ink-soft` over three soft tints, `globals.css:13-18`) needs a manual check per tint, not one eyeball pass.
- `RecipeReview.tsx` wasn't named in the task; including it (step 4) keeps all three sites consistent but can be dropped without affecting steps 1-3.
- Resolved 2026-09-28: the hosted project is through migration `0008` (owner-confirmed; `CLAUDE.md` updated). A Phase 2c migration would be `0009`.
- **Q1:** Is a device-only, backup-exempt photo (2a) acceptable as a first ship, or is backup coverage (2b) a hard requirement first?
- **Q2:** Pull worker-sourced cover images (2d) into the first photo PR, or keep it deferred as recommended?
- **Q3:** Should Phase 1's generated cover ship at all, or would a text-only card with no cover block be the preferred permanent look?

## Acceptance criteria

**Phase 1**
- [ ] No empty `bg-paper-2`/`aspect-video` placeholder remains in `LocalScreens.tsx` or `RecipeDetail.tsx`.
- [ ] Both sites use one shared `RecipeCover` (and `RecipeReview.tsx` if step 4 is included).
- [ ] Cookbook card shows cuisine · time · servings and description when present; cooked-count copy byte-identical to today.
- [ ] New/updated tests pass; `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` all green.

**Phase 2 (investigation only)**
- [ ] Owner has answered Q1-Q3 above.
- [ ] A follow-up plan/PR scopes exactly Phase 2a before any 2b/2c work starts.

## Implementation notes

Session scope: Phase 1 only (branch `claude/premium-ui-02-recipe-imagery`). Phase 2 stays investigation-only, per the owner decision. There are no IndexedDB, schema, backup or sync changes, and no `<img>`.

### Shipped

- `c15ff19` **`RecipeCover`** (`components/recipe/RecipeCover.tsx`, with `recipe/__tests__/RecipeCover.test.tsx`).
  - Takes `{ recipe: Pick<Recipe, "title" | "cuisine" | "course">; className?: string }`.
  - Tint: a char-code hash of the trimmed, lowercased `cuisine || course || title` picks one of `bg-terra-soft`, `bg-forest-soft` or `bg-warn-soft`. Blank strings fall through to the next field.
  - Glyph: a serif initial in `text-ink-soft` for every tint. `coverInitial` is code-point safe, so an emoji stays whole. An empty title renders the tint only.
  - The glyph scales with the cover through `@container` and `text-[clamp(3rem,22cqi,10rem)]`.
  - The cover is decorative (`aria-hidden`) and marked with `data-recipe-cover` for tests.
  - Contrast of `ink-soft` (#5C544A) on each tint: terra-soft 5.65:1, forest-soft 5.74:1, warn-soft 5.83:1. All three pass AA.
- `556aa7c` **Cookbook cards.**
  - The grid in `LocalScreens.tsx` is now a `<ul>` of the new `components/app/CookbookCard.tsx`. That file is built on `Card as="li" interactive padding="none"`, with the whole card as one link.
  - Card contents, in order: `RecipeCover` (`aspect-video`), the serif title (`text-balance break-words`), and the meta line. The meta line comes from `cookbookMeta()`: `cuisine · N min · serves N`, using `total_time_min ?? cook_time_min` and skipping missing parts. It is set as an uppercase eyebrow with `tabular-nums`.
  - After the meta line come the italic `line-clamp-2 text-pretty` description (when present) and the cooked count, whose copy is byte-identical to before (`N× cooked` / `just added`, now `tabular-nums`, pinned to the card bottom).
  - The `LocalScreens.tsx` hunk is 7 lines: the import plus the grid.
  - Tests: `app/__tests__/CookbookCard.test.tsx` covers the meta format and fallbacks, description only when present, the cooked copy, the featured highlight, and a `LocalScreens` cookbook render with no placeholder.
- `a1f5b78` **Recipe detail hero.** The 16:10 placeholder becomes `<RecipeCover className="aspect-[16/10] w-full rounded-card" />`. The change is the hero hunk plus one import line. Tests: `recipe/__tests__/RecipeDetail.cover.test.tsx`.
- `8d32bf6` **Import review hero** (`RecipeReview.tsx`). It now uses `RecipeCover` with `aspect-video rounded-card`, in its own commit so it can be dropped. Tests: `recipe/__tests__/RecipeReview.cover.test.tsx`.

### Deviations

- **Card in its own file.** The card lives in a new `CookbookCard.tsx` rather than inline, which keeps the `LocalScreens.tsx` diff minimal next to plan 08's heading edits.
- **Featured highlight.** The first card's `border-2 border-terra` is now `ring-2 ring-terra`, passed through `Card`'s `className`, along with `overflow-hidden` to clip the cover to the card radius. `Card` already sets `border-line`, and a second border color class would depend on CSS order, while a ring composes with `shadow-card`. Both classes stretch the "layout-only" `className` rule. A `featured`/`highlight` prop on `Card` would be cleaner if plan 03's owner wants one.
- **Heading level.** The card title stays a `<p>` (not a heading), so no role-based selectors change.
- **Detail tests.** The plan asked for a full `RecipeDetail.test.tsx`. Plan 05 owns the rest of `RecipeDetail.tsx` and is renaming "Start cook mode →" and moving delete onto `Dialog`, so I added only a hero-scoped `RecipeDetail.cover.test.tsx`, to avoid a colliding file and assertions that plan 05 would immediately break. The action-handler tests are plan 05's.
- **Review hero radius.** The review hero moved from `rounded-2xl` (16px) to `rounded-card` (12px), to match the detail hero.

### Checks

Run from `frontend/`:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 55 files and 434 tests pass (baseline was 421; 13 are new).
- `pnpm build`: pass, with CI's public env.
- `pnpm test:pwa`: 7/7 pass, using the headless-shell shim from `IMPLEMENTING.md`.
- **Screenshots.** Taken at 393×852 and 1280×860 of the cookbook (5 seeded recipes covering all three tints, missing fields and a clamped long description) and of recipe detail, against the production build. The covers, meta line, clamp and featured ring render as intended. No copy or roles changed, so no existing tests needed updating.

### Handoffs

- **Plan 05:** keep the `RecipeCover` import and the hero hunk in `RecipeDetail.tsx` when restructuring. The old `RecipeDetail.test.tsx` suggestion from this plan (action handlers) is yours.
- **Plan 06:** `RecipeCover` is a good `view-transition-name` target for cookbook card → detail hero (it has a `data-recipe-cover` hook). Press feedback on `Card` will apply to cookbook cards automatically.
- **Plan 09:** covers use `terra-soft`/`forest-soft`/`warn-soft` with an `ink-soft` glyph. Re-check glyph contrast for each tint against the dark token values.

### Needs a device

- None required for Phase 1. Optionally, confirm that the `cqi`-sized initial renders at the expected size in the installed iOS PWA (container query units need Safari 16+).
