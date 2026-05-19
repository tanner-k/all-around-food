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

## Phase C (Next)
- [ ] Real E2E smoke test with Playwright (import flow end-to-end in browser)
- [ ] Deploy backend somewhere reachable from Vercel (staging API)
- [ ] Recipe detail page (/cookbook/[id])
- [ ] Cook mode (hero hands-free flow with step navigation)
- [ ] Edit a saved recipe (inline edit or modal)

## Later
- [ ] Real responsive mobile layout (current is desktop-first)
- [ ] Background eval re-runs when worker prompt changes (auto re-grade historical parses)
- [ ] TikTok / video import source
- [ ] Email recipe forwarding
- [ ] Manual recipe entry form
- [ ] Planner (weekly meal planning)
- [ ] Shopping list generation
- [ ] Pantry inventory
- [ ] Auth + multi-user
- [ ] Deploy to production

## Icebox
- [ ] (ideas that aren't on the roadmap yet)
