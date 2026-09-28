# Plan 10: Detail polish

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 03 (design tokens and primitives)

## Goal

Close the small finishing gaps that make the app read "assembled" rather than "designed": ad-hoc unicode icons, unstyled native form controls, weak focus rings, no typographic refinement, plain-text loading states, and inconsistent small details. Checklist-style; grouped into small PRs.

## Current state (re-verified 2026-09-28)

**Unicode glyph icons** (no icon library anywhere; every icon is a literal character):
- `⏱`: `RecipeDetail.tsx:59`, `CookScrollView.tsx:33`
- `⏳`: `ImportFlow.tsx:61` (`app/(app)/import/`)
- `✓`: `RecipeDetail.tsx:206`, `ImportFlow.tsx:71`, `CookStepView.tsx:99`
- `→`: `RecipeDetail.tsx:213`, `CookMode.tsx:215`, `CookStepView.tsx:121`
- `×`: `PlannedRecipeCard.tsx:16` — **also** `ShoppingRow.tsx:77` (delete button), not in the original list
- Also present, not in the original list: `🌡` (`CookScrollView.tsx:37`, `CookStepView.tsx:97`), `⏲` (`CookStepView.tsx:94`, `CookTimer.tsx:53`), `‹`/`›` (`CookStepView.tsx:113`, `CookMode.tsx`)

**Native unstyled controls:**
- `<select>`: `RecipeEditForm.tsx:216-230` (Difficulty, shares `inputClass`, `:13-14`); `RecipeCopySettings.tsx:50` (version picker — some border/radius classes but native arrow/appearance).
- `<input type="checkbox">`: `RecipeCopySettings.tsx:53` (confirm backup); `RecipeEditForm.tsx:283` ("Optional" flag, fully unstyled); `AddFromRecipesModal.tsx:29` (`accent-terra`, partially styled).
- Correction to the brief: `ShoppingRow.tsx:14-40` is **not** a native checkbox — it's already a custom `role="checkbox"` button with an inline SVG check, token-colored. That's the pattern to standardize on, not a site needing fixes.

**Focus rings:** `inputClass` (`RecipeEditForm.tsx:13-14`) is `focus:outline-none focus:border-terra` — a 1px border-color change only, fires on mouse click too (not `focus-visible`), reused at every `className={inputClass}` site in that file (12+ fields).

**iOS input auto-zoom:** iOS Safari zooms on focusing any input under 16px font. `inputClass` sets `text-sm` (14px) — every input in `RecipeEditForm.tsx` is affected. Checked elsewhere: `ShoppingAddForm.tsx:31-41`, `PantryAddForm.tsx:27`, `ZipSelector.tsx:45-48`, `RecipeReview.tsx:116-171`, `app/login/page.tsx:65` set no explicit size class and inherit the 16px base — already safe. This is a one-file problem.

**Loading states:** one top-level state, not per-screen — `LocalApp.tsx:55-56` renders `<LocalScreens>` only once `snapshot` resolves; until then it shows `<p role="status">Opening your local cookbook…</p>` regardless of destination route. `ImportQueue.tsx:166` has its own separate `"Loading queue…"` text. `LocalScreens.tsx:65` never renders mid-load — it receives `snapshot` already resolved.

**Empty states:** already structurally consistent (`rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute` or close variants) across `LocalScreens.tsx:85`, `PantryView.tsx:29`, `ShoppingListView.tsx:41`, `ImportQueue.tsx:169`, `LocalImports.tsx:124`, `RecipePickerModal.tsx:38`. Text-only, no icon.

**Typography gaps confirmed absent app-wide** (zero `grep` hits each): `text-balance`/`text-pretty`, `tabular-nums`, `tap-highlight-color`, `::selection`, `hyphens`. Candidates: headings (`SectionHeader.tsx:28-32`, `RecipeDetail.tsx:105` via `pageTitle` in `lib/typography.ts:1`); numbers — timers at `CookMode.tsx:206`, `CookTimer.tsx:53`, `TimerSheet.tsx:89` (via `lib/format-time.ts`), and meta pills/quantities at `RecipeDetail.tsx:59-60`, `ShoppingRow.tsx:68`; long, unclamped recipe titles with no wrap handling (`SectionHeader.tsx`, `RecipeDetail.tsx:105`, `LocalScreens.tsx:89`).

**Section eyebrows — four different classNames for one visual role:** `text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute` (`RecipeEditForm.tsx:17,130,237,314`, `RecipeDetail.tsx:129,160`, `RecipeReview.tsx:158,192`, `CookIngredientPanel.tsx:55`); `tracking-[0.1em] text-terra` (`SectionHeader.tsx:25`, the "scene" label); `tracking-wide` in mixed weights/colors (`DayColumn.tsx:25`, `RecipeDetail.tsx:99,183`, `RecipeReview.tsx:151`, `PriceCompareTable.tsx:133-157`, `EvalTable.tsx:95-227`); `tracking-widest text-terra` (`DataSettings.tsx:117`).

No `frontend/src/components/ui/` exists yet (plan 03 creates it) — this plan's fixes are interim call-site patches, not new primitives.

## Scope and non-goals

**In scope:** all items above as concrete per-file fixes, plus two lightweight skeletons. **Non-goals:** building reusable `Select`/`Checkbox`/`Skeleton` primitives in `components/ui/` (plan 03's job); an icon library (README: prefer zero new dependencies); commissioned illustration for empty states.

## Design

- **Icons:** replace the two pictographic glyphs, ⏱ (`RecipeDetail.tsx`, `CookScrollView.tsx`) and ⏳ (`ImportFlow.tsx`), with lucide `Timer` and `Hourglass` (lucide is already a dependency). Neither Manrope nor Instrument Serif has these characters, so iOS will very likely fall back to Apple Color Emoji and draw colour emoji; confirm on a device. Keep the typographic glyphs →, × and ✓ (no dependency, matches the editorial voice); wrap each in `<span aria-hidden="true">` so decorative glyphs aren't double-announced against a button's accessible name, with a shared `text-[1em] leading-none align-[-0.05em]` treatment for consistent baselines across font fallbacks.
- **Select/checkbox:** `appearance-none` + custom chevron on `<select>`, matching `inputClass`'s border/radius/focus; replace the two remaining unstyled checkboxes with `ShoppingRow.tsx`'s proven `role="checkbox"` button + SVG pattern rather than a second checkbox language.
- **Focus:** add a `focus` token (plan 03/09) and swap `focus:outline-none focus:border-terra` for `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]`, with no `:focus` styling so mouse clicks stay quiet.
- **iOS zoom:** `inputClass`'s `text-sm` → `text-base` (16px); the smaller size looks incidental, not a deliberate density choice.
- **Skeletons:** two small, purpose-built pieces — a cookbook-grid skeleton (repeats `LocalScreens.tsx:89`'s card shape) and a recipe-detail skeleton (hero + meta row + two columns), both selected by `route.view` so `LocalApp.tsx:55-56` shows a shape-matched placeholder instead of one generic message for every destination.
- **Empty states:** keep the existing text-only structure and add one small `aria-hidden` glyph/hairline icon per context — a light touch, not new assets.
- **Typography:** `text-balance` on headings, `text-pretty` on longer body copy, `tabular-nums` on every numeric display above, `hyphens-auto` + `break-words` on long titles, explicit `active:` states on buttons/cards/rows (the global `-webkit-tap-highlight-color: transparent` rule itself is plan 07's), and one `::selection { background: var(--color-terra-soft); color: var(--color-ink); }` rule.
- **Section eyebrows:** consolidate into one shared export in `frontend/src/lib/typography.ts` (alongside `pageTitle`/`sectionTitle`) and migrate all call sites, preserving meaningful color differences (e.g. `SectionHeader`'s terra "scene" label) but unifying weight/tracking/size.

## Implementation steps — 3 PRs

**PR 1 — forms and inputs** (recipe-edit/settings surface)
1. `RecipeEditForm.tsx`: fix `inputClass` (focus ring + `text-base`); style the Difficulty `<select>` (216-230); style/replace the Optional checkbox (283).
2. `RecipeCopySettings.tsx`: style the version-picker `<select>` (50); swap the confirm checkbox (53) for the `ShoppingRow` pattern.
3. `AddFromRecipesModal.tsx:29`: align its checkbox with the same pattern.

**PR 2 — glyphs, typography, small surfaces**
4. Swap ⏱/⏳ for lucide `Timer`/`Hourglass`; wrap the remaining →/×/✓ glyph sites in `<span aria-hidden="true">` with the shared inline treatment.
5. Add `tabular-nums` to the three timers and the meta-pill/quantity sites.
6. Add `text-balance`/`text-pretty`/`hyphens-auto` at the heading and long-text sites.
7. Add `::selection` and a consolidated eyebrow class (tap-highlight comes from plan 07); migrate all cited call sites.

**PR 3 — loading and empty states**
8. Add `CookbookSkeleton` and `RecipeDetailSkeleton` (colocated with `LocalScreens.tsx`), wire `LocalApp.tsx:55-56` to pick by `route.view` (generic fallback for other routes) while `snapshot` is null.
9. Add a small `aria-hidden` glyph to each empty-state block.

## Tests and verification

- No CLAUDE.md-protected selector text changes ("Plan your week.", "+ Add recipe", "Review shopping →", "Merge backup", "Offline ready") — only glyph *wrapping* and input *styling* change; `getByText`/`getByRole` selectors keep matching.
- Re-run existing co-located tests (`RecipeEditForm`, `RecipeCopySettings` and nearest `__tests__` coverage); update any assertion that expects a native `<input type="checkbox">` where PR 1 swaps it for `<button role="checkbox" aria-checked>` (`ShoppingRow.tsx`'s own test is the reference for the expected shape).
- New unit tests: skeletons render without a snapshot; `LocalApp` picks the right one per `route.view` (vitest + Testing Library, colocated per `frontend/context.md`).
- `pnpm lint`/typecheck catch `aria-hidden`/unused-class regressions; `pnpm test:pwa` should still pass unchanged.

## Risks and open questions

1. Swapping the two remaining native checkboxes to `ShoppingRow`'s button pattern changes accessible markup (`<input>` → `<button role="checkbox">`) — low risk, no current test asserts the native shape, but worth a quick check before PR 1 merges.
2. PR 3's skeleton touches `LocalApp.tsx`'s loading branch, which also participates in account-switch/sign-out (`frontend/context.md`'s "Account library sync") — keep it purely presentational on the existing `snapshot`/`account` state, no new data dependency.

## Acceptance criteria

- [ ] Every glyph site is `aria-hidden` and visually aligned; no screen-reader double-announcement.
- [ ] `<select>`/checkbox controls in `RecipeEditForm.tsx`, `RecipeCopySettings.tsx`, `AddFromRecipesModal.tsx` are token-styled and share one checkbox visual language.
- [ ] All `RecipeEditForm.tsx` inputs use `focus-visible` rings and render at ≥16px.
- [ ] Cookbook and recipe-detail routes show a shape-matched skeleton instead of generic loading text.
- [ ] `tabular-nums`, `text-balance`/`text-pretty`, `hyphens-auto`, `active:` states, and `::selection` are applied at the cited sites.
- [ ] Section eyebrow styling is defined once and used everywhere it previously had a bespoke className.
- [ ] `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` all pass; no protected selector text changed.
