# Implementing the premium UI plans

Rules for the sessions that implement these plans in parallel. Read this, then [README.md](./README.md) (shared contract and ownership), then your own plan.

## How the work is split

Each plan runs in its own Claude Code session on its own branch, cut from `claude/premium-ui-feel-05we0e`. The coordinating session merges finished branches back into `claude/premium-ui-feel-05we0e` and verifies them. Work lands in waves so later plans build on earlier ones:

| Wave | Plans | Starts from |
|---|---|---|
| 1 | 01 sync status · 03 tokens, primitives, color sweep | the plan-set commit |
| 2 | 02 phase 1 · 04 cook mode · 05 recipe detail · 07 navigation · 08 week plan · 10 polish | wave 1 merged |
| 3 | 06 motion · 09 dark mode | wave 2 merged |

You may start your own subagents (the Agent tool) to parallelize inside your plan. Give each one a disjoint set of files, or use `isolation: "worktree"`, so they never edit the same file at once. You own the result: review their diffs and run the checks yourself before committing.

## File ownership

Stay inside the files your plan owns. If a change you need falls in a file another plan in your wave owns, don't make it. Record it under "Handoffs" in your implementation notes.

| Plan | Owns |
|---|---|
| 01 | `components/app/LocalApp.tsx` (sync rendering), `components/app/SyncStatus.tsx`, `components/settings/DataSettings.tsx` (sync mount), the `#app-header-status` slot in `app/layout.tsx`, the `sync` prop pass in `LocalScreens.tsx`, the sync section of `frontend/context.md` |
| 03 | `app/globals.css` token block, `lib/theme.ts`, `lib/typography.ts`, `components/ui/**`, `eslint.config.mjs`; the mechanical `#A55230`/`red-*`/`green-*` sweep in any file; primitive adoption only in `components/shopping/**`, `components/pantry/**`, `components/import/**`, `LocalImports.tsx`, `recipe/RecipeEditForm.tsx`, `recipe/RecipeReview.tsx` (CTAs), `app/login/page.tsx`. Leave `cook/**`, `plan/**`, `RecipeDetail.tsx`, `LocalScreens.tsx`, `layout.tsx`, `MobileTabBar.tsx` to their plans. |
| 02 (phase 1 only) | new `components/recipe/RecipeCover.tsx`; the cookbook grid in `LocalScreens.tsx`; the hero block in `RecipeReview.tsx`; the hero block only (around line 111) in `RecipeDetail.tsx` |
| 04 | `components/cook/**`, new `lib/wake-lock.ts`, a delimited cook-theme block in `globals.css`. Not `layout.tsx`: hiding the header on cook routes is plan 07's. |
| 05 | `components/recipe/RecipeDetail.tsx` (everything except the hero block), inline-amount rendering it uses |
| 07 | `app/layout.tsx` (header), new `app/(app)/_components/AppHeader.tsx` (including hiding it on cook routes and route-aware `main` padding, from plan 04 step 1), `MobileTabBar.tsx`, touch rules and `--tabbar-height` in `globals.css`, viewport/manifest metadata |
| 08 | `components/plan/**` (including `RecipePickerModal.tsx` onto `Sheet`, and the `×` in `PlannedRecipeCard.tsx`), the plan heading area in `LocalScreens.tsx` |
| 10 | everything else in plan 10: forms, selects, checkboxes, focus rings, `ShoppingRow.tsx`, `ImportFlow.tsx`, the loading skeletons in `LocalApp.tsx`, `::selection`/eyebrow rules in `globals.css`. Plan 10 items inside files owned by 02, 04, 05, 07 or 08 are done by that plan. |
| 06 (wave 3) | `lib/local/route-transition.ts`, the `hashchange` listener in `LocalApp.tsx`, motion CSS in `globals.css`, `data-recipe-title`/`view-transition-name` hooks, `@starting-style` on `Sheet`/`Dialog`, press feedback on `Button`/`Card` |
| 09 (wave 3) | dark values in `globals.css`, `lib/theme-preference.ts`, the pre-hydration script in `layout.tsx`, the theme control in Settings, the `text-white`/`bg-white` audit across files |

Wave 2 owners: also apply plan 10's items (tabular numbers, `text-balance`/`text-pretty`, glyph swaps) inside the files you own.

## Owner decisions in force

Use each plan's stated default unless listed otherwise:
- 01: the signed-out sync chip opens Settings.
- 02: ship the generated cover (tint + serif initial). Phase 2 (photos) is investigation only; no photo code this round.
- 03: `danger` stays close to `red-600`; `Menu` v1 is click/Escape only.
- 04: keep the separate mobile/desktop render trees.
- 05: rename "Start cook mode →" to "Start cooking" and update the tests that assert it.
- 07: drop the Import tab (4 tabs); Import moves to the header quick-add. No splash artwork.
- 08: before any meals exist, show "Review shopping →" as an outline button.
- 10: replace native checkboxes with the `ShoppingRow` button-checkbox pattern.

## Hard rules

- Frontend only. No Supabase migrations, no backend changes, no new dependencies.
- Keep `/app` local-first: no new Supabase or FastAPI calls in the `/app` client tree.
- Don't edit `TODO.md`, `CHANGELOG.md`, `CLAUDE.md` or `AGENTS.md`. The coordinator updates them after merging.
- Never skip, disable or loosen a test to get green. If you change visible text or roles, update the tests that assert them, and say so in your notes.
- Don't bypass the Husky pre-commit hook. Commit in small, reviewable steps with clear messages.
- Don't open a pull request. Push your branch; the coordinator merges it.

## Checks before your final push

Run from `frontend/` after `pnpm install --frozen-lockfile`:

```sh
pnpm lint
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
pnpm test:pwa   # Chromium is preinstalled; do not run `playwright install`
```

Baseline on 2026-09-28: lint, typecheck and 362 unit tests pass. If `pnpm test:pwa` can't run in your environment, say exactly why in your notes.

Also run the app (`pnpm dev`) and screenshot the screens you changed at 393×852 (phone) and 1280×860 (desktop), to catch what tests don't. Note anything that needs a real iPhone (status bar, wake lock, safe areas) under "Needs a device".

## Report back

When done, append `## Implementation notes` to your plan file with:
- **Shipped:** what changed, by commit.
- **Deviations:** where you departed from the plan, and why.
- **Checks:** the result of each command above.
- **Handoffs:** changes you needed in files you don't own.
- **Needs a device:** checks only a real iPhone/iPad can confirm.

Then commit and push. That section is how the coordinator reviews your work.
