# TODO

> Active work. New tasks go here as `- [ ] description`.  
> When a task is complete, **either** check it off and run `python3 scripts/done.py "description"`, **or** move the line manually to `CHANGELOG.md` under today's date.

## Phase A (Completed)
- [x] Wire up CI (frontend pnpm + backend uv)
- [x] Init Next.js 15 + Tailwind v4 + design tokens from docs/design/Cookbook App Flow.html
- [x] Build top nav + 5 empty routes (Plan, Cookbook, Shop, Pantry, Import)
- [x] Stub Polars storage layer with immutable RecipeStore
- [x] Add one E2E smoke test (frontend renders + backend round-trips a recipe)

## Phase B (Completed)
- [x] FastAPI backend with /recipes + /evaluations endpoints
- [x] Structured Recipe schema as shared contract (Pydantic + Zod)
- [x] Claude parsing (screenshot via vision + URL via text)
- [x] LLM-as-judge eval pipeline (Sonnet grades Haiku parse)
- [x] Import flow UI (DropZone → ParsingProgress → RecipeReview → SavedConfirmation)
- [x] Cookbook list view (.rcard grid)
- [x] /evaluations dev dashboard (stats + expandable table)
- [x] docs/evaluations.md guide

## Phase C (Completed)
- [x] Recipe detail page (/cookbook/[id]) — magazine-style with hero, meta pills, grouped ingredients
- [x] Cook mode (/cookbook/[id]/cook) — two layouts (step-by-step + full-scroll), toggleable, persisted in localStorage
- [x] Mark-cooked action (increment times_made)
- [x] Edit a saved recipe (/cookbook/[id]/edit) — structured form with add/remove rows
- [x] Backend: PUT /recipes/{id} and POST /recipes/{id}/cooked endpoints + RecipeStore methods
- [x] Responsive layouts for detail, cook, edit screens
- [x] Per-step countdown timer in cook mode
- [x] InlineAmountText component extracted and reused

## Phase D (Next)
- [ ] Real E2E smoke test with Playwright (import flow end-to-end in browser)
- [ ] Deploy backend somewhere reachable from Vercel (staging API)

## Audit follow-ups (2026-06-17) — shared blockers
> From the feature audit. These gate every parse/pricing feature below.
- [ ] Provision `ANTHROPIC_API_KEY_PARSING` (all Claude parsing fails without it)
- [ ] Add `frontend/.env.local.example` + `backend/.env.example` (document `BACKEND_URL`, `WHISPER_MODEL`, `YTDLP_BIN`, `FFMPEG_BIN`, `VIDEO_IMPORT_TIMEOUT_S`)
- [ ] Resolve prod backend reachability — `BACKEND_URL` defaults to localhost, so proxied video/pricing routes fail off-box (ties to Phase D deploy)
- [ ] Seed/ingest pricing data — `data/` is empty, so store comparison returns nothing

## Audit follow-ups — Video recipe parsing
> Pipeline is code-complete; these make it actually runnable.
- [ ] Replace whispr STT with in-process whisper.cpp via `pywhispercpp` — new `backend/.../transcription.py` (mirror OCR `qwen_loader.py`), drop `WHISPR_URL`, generalize caption fallback
- [ ] Supersede ADR 0002 with new ADR (local whisper.cpp transcription); update README (remove whispr port-collision section) + `backend/context.md`
- [ ] Swap whispr-specific tests for `FakeTranscriber`-based tests in `test_video_import.py`
- [ ] Install + document `ffmpeg` and `yt-dlp` for dev/deploy (`ffmpeg` is not a Python package)
- [ ] Pre-fetch whisper model (`base.en` GGML) in deploy provisioning
- [ ] Remove dead `isVideoRecipeUrl()` / `parseVideoUrl()` in `frontend/src/lib/api.ts` (or route ImportFlow through them)
- [ ] Add skippable end-to-end video-import test (`@network`/`@slow`)

## Audit follow-ups — Shopping list upload (not yet built)
- [ ] Frontend: `ShoppingListParseSchema` + Claude tool & `parseShoppingListFromImage()` in `lib/claude.ts` (template off the receipt path)
- [ ] Frontend: `/api/shopping-list/parse` route + `parseShoppingList()` / `importShoppingListItems()` in `lib/api.ts`
- [ ] Frontend: `ShoppingListImportFlow` component + upload entry on `/shop`; extend `DropZone` with a `"shopping-list"` variant
- [ ] Backend: `POST /shopping-list/parse` bulk-add endpoint writing to `shopping_storage` (mirror `/pantry/receipt-import`)
- [ ] Tests for shopping-list parse schema + endpoint

## Audit follow-ups — Shopping list store comparison
> Pricing backend is ~85% there; the shopping-list bridge and real data are missing.
- [ ] Wire shopping list → `POST /pricing/basket`: map items to canonical product IDs + "Compare across stores" button + ZIP selector on `/shop`
- [ ] Render basket comparison results (cheapest store total)
- [ ] Validate ≥1 adapter end-to-end against live data (start with Kroger official API)
- [ ] Implement Playwright fallbacks (currently `NotImplementedError`) for walmart/costco/whole_foods/instacart locations + search
- [ ] Costco: confirm promo field + membership flag; Instacart: `source_retailer` tagging; Costco ZIP→geocoding in `locations/resolver.py`
- [ ] Add Costco adapter test + shopping→basket integration test
- [ ] `/prices` page: error handling + loading states

## Later
- [ ] Real responsive mobile layout (current is desktop-first)
- [ ] Background eval re-runs when worker prompt changes (auto re-grade historical parses)
- [ ] TikTok / video import source
- [ ] Email recipe forwarding
- [ ] Manual recipe entry form
- [ ] Auth + multi-user
- [ ] Deploy to production

## Icebox
- [ ] (ideas that aren't on the roadmap yet)
