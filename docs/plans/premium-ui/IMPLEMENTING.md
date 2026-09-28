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
| 07 | `app/layout.tsx` (header), `ServiceWorkerRegister.tsx` (pill placement only), new `app/(app)/_components/AppHeader.tsx` (including hiding it on cook routes and route-aware `main` padding, from plan 04 step 1), `MobileTabBar.tsx`, touch rules and `--tabbar-height` in `globals.css`, viewport/manifest metadata |
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
- 09: **fix light-mode contrast too** (owner, 2026-09-28). Today `#C2613B` fails 4.5:1 for small text on every light surface: 4.14 on white (button labels), 3.88 on `bg`, 3.58 on `paper-2`, 3.15 on `terra-soft` chips. Target:
  - `terra` (`#C2613B`) stays the brand accent for large display type (3:1 is enough there: 3.88 on `bg`), icons, borders, progress bars and decorative fills.
  - `terra-strong` becomes about `#9A4A2B`. Primary `Button` fills and every small terracotta text use it: section labels, links, the active tab label, and chip text on `terra-soft`. That gives 6.20 against white, 5.80 on `bg`, 5.36 on `paper-2` and 4.71 on `terra-soft`.
  - A new `terra-deep` (about `#8A4125`, 7.33 against white) is the hover/active state for `terra-strong` fills.
  - Add a unit test that computes WCAG ratios for the token pairs the app actually uses, in both themes: small text at least 4.5:1, large text and non-text UI at least 3:1. The palette then can't regress silently.

## Wave 1 results and handoffs

Plans 01 and 03 are merged. Read the Implementation notes at the end of `01-sync-status.md` and `03-design-tokens-and-primitives.md`; the 03 notes list the exact props of every primitive.

- **Primitives:** `@/components/ui/{Button,IconButton,Card,Sheet,Dialog,Menu}`. `className` on a primitive is for layout only. `Sheet` has no built-in header or close button; add an `IconButton` inside it. `Menu` renders its own trigger. `Dialog` focuses Cancel when it opens.
- **02, 04, 05, 08:** adopt the primitives in your files. That means `Sheet` for `RecipePickerModal` (08), `IngredientsSheet` and `TimerSheet` (04, deleting their own focus, scroll-lock and Escape code), `Dialog variant="danger"` for recipe delete (05), and `Button size="lg"` for cook mode's 56px buttons (04).
- **07:** keep the `#app-header-status` slot next to the brand mark when you move the header into `AppHeader.tsx`. Its `-ml-5` offsets the nav's `gap-8`. The chip is about 30px tall, so size it for the header's touch targets. Keep `themeColor` reading `TERRA_HEX` from `lib/theme.ts` when you add the light/dark array. Also move the floating "Offline ready" pill (`ServiceWorkerRegister.tsx`): hide it on cook routes and keep it above the tab bar with `--tabbar-height`. You own that file for this change.
- **10:** also switch the sync chip's dot colors in `SyncStatus.tsx` to the new tokens (`danger` for "Sync needs attention"), and adopt `Button`/`IconButton` in `ShoppingRow.tsx` and `ImportFlow.tsx`.
- The hex guard in `eslint.config.mjs` rejects `#rrggbb` literals in `.ts`/`.tsx` outside `lib/theme.ts`. Use tokens.

## Wave 2 results and handoffs (for wave 3)

Plans 02 (phase 1), 04, 05, 07, 08 and 10 are merged, plus coordinator integration fixes in `6311f11`. Read the Implementation notes at the end of each of those plan files; their Handoffs sections name plan 06 and plan 09 directly.

Changes to know about:
- **"Offline ready" moved.** The passive status now lives in Settings' "Install for offline use" card, read through `lib/pwa-status.ts`. `ServiceWorkerRegister` floats only update, install and error notices.
- **The header is `app/(app)/_components/AppHeader.tsx`.** It exports `useIsCookRoute()` and `AppMain`. There is a fixed status-bar scrim in `layout.tsx` for `black-translucent`.
- **Recipe detail.** The cover is a 240px banner from `md:`. The `<h1>` is a single element, split into text plus `<em>`. Cookbook cards and the detail hero both render `RecipeCover`, which carries a `data-recipe-cover` hook.
- **Cook mode.** It has its own session-only kitchen-dark block in `globals.css` (`[data-cook-theme="dark"]`, mirrored onto `<body>` so portaled sheets match). There is also a local `cook-rise` entrance animation.

**Plan 06 (motion):**
- Consider morphing `RecipeCover` (card → detail banner) as well as the title.
- Fold `cook-rise` into the shared motion tokens.
- Add `@starting-style` entry to the header `Menu` popover, `Sheet`/`Dialog` (`ui/internal/Overlay.tsx`, backdrop `[data-overlay-backdrop]`), and the active tab pill.
- Press feedback goes in `Button` and `Card`. Plan 09 also edits `Button.tsx` in parallel (primary fill color), so keep your hunk to the class list for press feedback.

**Plan 09 (dark mode and contrast):**
- Replace `THEME_COLOR_DARK_HEX` in `lib/theme.ts`.
- The status-bar scrim and header already use `--color-bg`.
- The shared overlay backdrop is `bg-ink/40`, which turns light when `ink` is cream. Give it a dedicated scrim token that stays dark in both themes, and drop cook mode's local override once it does.
- Point cook mode's kitchen block at your dark values, or make the kitchen toggle follow the app theme. Either way, remove duplicated hex values.
- Re-check `RecipeCover` glyph contrast on its three tints in dark mode.
- Apply the light-mode contrast decision above (`terra-strong` for primary fills and small accent text).
- Plan 06 also edits `Button.tsx` and `ui/internal/Overlay.tsx` in parallel, so keep your hunks there small and limited to color.

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

Baseline after wave 2 (`6311f11`): lint, typecheck, 503 unit tests, build, and 10/10 PWA tests pass.

**Making `pnpm test:pwa` run in a cloud container.** CI installs its own Chromium. Here, the preinstalled build is 1194, but Playwright 1.60 wants `chromium_headless_shell-1223` at a different path. Don't run `playwright install`. Build with CI's public env and point Playwright at a shim:

```sh
export NEXT_PUBLIC_SUPABASE_URL=https://aaf-mock.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key NEXT_PUBLIC_ACCOUNT_SYNC_STAGE=recipes
PW=$(mktemp -d)/pw && mkdir -p $PW/chromium_headless_shell-1223/chrome-headless-shell-linux64
ln -s /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell $PW/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
touch $PW/chromium_headless_shell-1223/INSTALLATION_COMPLETE
pnpm build && PLAYWRIGHT_BROWSERS_PATH=$PW pnpm test:pwa
```

**Hooks.** The Husky pre-commit hook isn't installed in cloud checkouts (`core.hooksPath` is unset), so lint-staged won't run on your commits. Run `pnpm lint` yourself before each commit. Keep the frontend's existing double-quote style.

Also run the app (`pnpm dev`) and screenshot the screens you changed at 393×852 (phone) and 1280×860 (desktop), to catch what tests don't. Note anything that needs a real iPhone (status bar, wake lock, safe areas) under "Needs a device".

## Report back

When done, append `## Implementation notes` to your plan file with:
- **Shipped:** what changed, by commit.
- **Deviations:** where you departed from the plan, and why.
- **Checks:** the result of each command above.
- **Handoffs:** changes you needed in files you don't own.
- **Needs a device:** checks only a real iPhone/iPad can confirm.

Then commit and push. That section is how the coordinator reviews your work.
