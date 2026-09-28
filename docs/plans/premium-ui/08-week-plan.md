# 08 · Week plan layout

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 03 (design tokens and UI primitives)

## Goal

Replace the seven identical bordered day boxes with a compact week view that
emphasizes today, keeps empty days quiet, and gives filled days room —
while preserving every accessible name the e2e and unit suites depend on,
or updating them deliberately with each edit listed.

## Current state

Files: `frontend/src/components/plan/PlanView.tsx`, `DayColumn.tsx`,
`PlannedRecipeCard.tsx`, `RecipePickerModal.tsx`. The heading/description
above the view live outside these files, in
`frontend/src/components/app/LocalScreens.tsx:130` (`SectionHeader
title="Plan your week." description="Add recipes to each day, then turn
them into a shopping list."`) — this plan doesn't touch `LocalScreens.tsx`,
but note that's the source of the `"Plan your week."` name the e2e spec
checks, not `PlanView.tsx`.

- **Day grid** (`PlanView.tsx:81-87`): `grid-cols-1 sm:grid-cols-2
  lg:grid-cols-7` of seven `DayColumn`s, each `border border-line` /
  `border-terra bg-terra-soft/40` when `isToday` (`DayColumn.tsx:23`).
  Empty and full days render the same bordered box.
- **Day number** (`DayColumn.tsx:26`): `font-serif text-lg` on the right —
  already correct, keep it.
- **Add affordance** (`DayColumn.tsx:31`): full-width dashed `+ Add recipe`
  button, identical whether the day is empty or already has meals.
- **Remove control** (`PlannedRecipeCard.tsx:16`): bare `×`, `aria-label
  ={`Remove ${recipeTitle}`}`, `min-h-7 min-w-7` — below the 44×44 minimum
  plan 03's `IconButton` will enforce.
- **Servings input** (`PlannedRecipeCard.tsx:18-24`): native `<input
  type="number" min="0.5" step="0.5">`, `aria-label="{title} servings"`, no
  visible +/- controls, base servings as placeholder.
- **CTA** (`PlanView.tsx:88-92`): `Review shopping →`, always rendered,
  `disabled={meals.length === 0 || reviewing}` — Tailwind's `disabled:
  opacity-50` on `bg-terra` reads as broken, not intentionally inactive.
- **Bottom copy** (`PlanView.tsx:89`): `"Plan your week, then turn it into a
  shopping list."`, sits beside the CTA in a `border-t` footer row.
- **Picker** (`RecipePickerModal.tsx:20-26`): bespoke fixed overlay, no
  focus trap, no Escape handler, no search — not built on `Sheet`.
- **Week nav** (`PlanView.tsx:78`): plain `Previous week` / `Next week`
  text links, no compact strip or "today" jump.
- **Occurrence identity** (`frontend/context.md`, "Planning, shopping, and
  pantry sync"): each occurrence has a persisted ID and position;
  `plannedMealId` (`frontend/src/lib/meal-plan-schema.ts:21-23`) falls back
  to `legacy:{week_of}:{index}` for meals without a stored ID. Any layout
  change must keep keying rendered cards by this ID (already done via
  `key={meal.id}`), not array index.

## Scope and non-goals

In scope: day-cell empty/filled/today states, CTA visibility/disabled
treatment, `RecipePickerModal` → shared `Sheet` + search, remove-button hit
target, week-nav polish, servings stepper *presentation* only (same
underlying input/contract, better controls).

Out of scope: sync/outbox semantics in `frontend/src/lib/local/repository.ts`
or the occurrence-ID model above; auto-plan/suggestions and drag-and-drop
(shown in `docs/design/screens-chosen.jsx`'s `X1_Week`/`X4_Suggestions` but
not implemented anywhere in this codebase — not this plan's scope to add).

## Design

**Today:** keep the existing `border-terra bg-terra-soft/40` + `text-terra`
weekday label (`DayColumn.tsx:23,25`) — already correct, just confirm it
still reads clearly once other days go quieter.

**Quiet empty days:** don't render a full dashed box for a day with zero
meals — reduce it to a single subtle add affordance (ghost/text button,
border/background only on hover/focus). Once a day has ≥1 meal, the add
control can shrink to a smaller "+ Add another" row below the existing
cards. **Keep an element per day whose accessible name matches `/Add
recipe/`** — both `pwa-planning.spec.ts` (exact string `"+ Add recipe"`)
and `LocalPlanning.test.tsx` (regex `/Add recipe/`) depend on it; don't
drop the leading "+".

**Filled days:** `PlannedRecipeCard` gets cleaner spacing, title as the
primary line. Replace the bare `×` with plan 03's `IconButton` (44×44 hit
area), keeping the exact `aria-label` format `Remove ${recipeTitle}` —
`LocalPlanning.test.tsx:51,65` match `"Remove Toast"` verbatim.

**Servings "stepper":** keep the single numeric input with `role
="spinbutton"` and `aria-label="{title} servings"` unchanged —
`pwa-planning.spec.ts:42` and `LocalPlanning.test.tsx` both match that
exact role+name. Add visible −/+ buttons that call `onServingsChange` with
`value ± step`, each with its own `aria-label` (e.g. `Decrease {title}
servings`) so they don't collide with the spinbutton's name; `null` still
clears back to `baseServings` placeholder (`PlannedRecipeCard.tsx:21`).

**Week navigation:** replace the plain text links (`PlanView.tsx:78`) with
compact `IconButton` chevrons plus a "This week" jump when the viewed week
isn't current (`adjacentWeek` already computes neighbors, 22-26; compare
against `currentMonday()`).

**CTA visibility:** don't let `Review shopping →` render washed-out and
disabled. Pick one: (1) **hide** it entirely while `meals.length === 0`, or
(2) **ghost-style** while empty, filled once meals exist. Recommend ghost
over hide — it keeps footer layout stable and signals the affordance up
front. Either way the element must exist with the exact name `"Review
shopping →"` once `meals.length > 0`, since neither test suite asserts a
disabled state first. Once meals exist, make the CTA sticky on mobile
above the tab bar (same clearance problem plan 05 solves for the recipe
detail primary action — reuse whatever convention lands first).

**Bottom copy** (`PlanView.tsx:89`) isn't a protected string and isn't
tested — free to reword or drop given the near-duplicate `SectionHeader`
description already shown above the view.

**Picker → `Sheet`:** rebuild `RecipePickerModal` on plan 03's `Sheet`
(shared focus trap via `lib/focus-trap.ts`, Escape/overlay close, bottom
sheet on mobile / centered panel on desktop — all currently missing). Add a
case-insensitive title search (no new dependency, per the README's "prefer
zero new dependencies"). Keep the "Pick a recipe" heading and empty-state
copy free to adjust, but recipe row buttons must keep their accessible
name equal to `recipe.title` exactly — `pwa-planning.spec.ts:38` uses
`exact: true`, `LocalPlanning.test.tsx:25,28` matches the bare title. Don't
fold secondary info (time, servings) into that same accessible name.

## Implementation steps

1. **`DayColumn.tsx`** — quiet empty-day state vs. filled-day state; keep
   `/Add recipe/` accessible name in both.
2. **`PlannedRecipeCard.tsx`** — `×` → `IconButton` (same `aria-label`),
   add visible −/+ around the servings input without changing its role,
   name, or value contract.
3. **`PlanView.tsx`** week-nav row (line 78) — chevrons + conditional
   "This week" jump.
4. **`PlanView.tsx`** CTA row (88-92) — hide- or ghost-until-meals (pick
   one, document the choice in the PR), sticky once visible.
5. **`RecipePickerModal.tsx` → `Sheet`** (needs plan 03): rebuild on the
   shared primitive, add title search, keep row-button names as
   `recipe.title`.
6. **Test updates** (below) land with the step that changes the selector
   they cover, not batched separately.

Steps 1–4 don't need plan 03; step 5 does.

## Tests and verification

- **`frontend/e2e/pwa-planning.spec.ts`**: line 36 heading is owned by
  `LocalScreens.tsx`, unaffected. Lines 37,39 — `"+ Add recipe"` must
  remain exact on at least the first empty day. Lines 38,40 —
  `{ name: "Eggs on toast", exact: true }` picker row. Line 42 — spinbutton
  role/name preserved even with −/+ added. Line 43 — `"Review shopping →"`
  must exist (not merely be present-but-disabled) once two meals are
  planned.
- **`frontend/src/components/app/__tests__/LocalPlanning.test.tsx`** (5
  tests): same accessible-name dependencies — `/Add recipe/`, picker row
  `"Toast"`, `"Remove Toast"` (must survive the `×` → `IconButton` swap),
  spinbutton `"Toast servings"`. Also exercises card removal/edit ordering
  keyed by `meal.id` (lines 42-70) — confirm cards stay keyed by
  `meal.id`/`plannedMealId`, not array index, after the layout change.
- No dedicated `PlanView.test.tsx`/`DayColumn.test.tsx`/
  `PlannedRecipeCard.test.tsx` exist — consider adding co-located unit
  tests for the new empty/filled states and CTA visibility logic, since the
  existing suites only cover the happy path via `LocalApp`/`LocalScreens`.
- Run `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`
  before merge — `pwa-planning.spec.ts` needs the Chromium `test:pwa` run.

## Risks and open questions

- Hide-vs-ghost for the CTA isn't settled by existing tests (neither
  asserts `disabled` today) — recommend ghost-until-meals for layout
  stability, but this is a call for the owner to confirm.
- `RecipePickerModal`'s move to `Sheet` depends on plan 03's `Sheet`
  supporting a search input in its header/body slot — confirm that shape
  before starting step 5.
- The mobile CTA sticky-offset mechanics duplicate the tab-bar-clearance
  problem plan 05 solves for the recipe-detail primary button; worth a
  shared helper once both land rather than solving it twice.

## Acceptance criteria

- [ ] Empty days render a quiet single add affordance; filled days show
      recipe title + a servings stepper without a repeated dashed box.
- [ ] Today is visually emphasized relative to other days.
- [ ] `Review shopping →` never renders washed-out/disabled-terra; it's
      absent or ghost-styled until meals exist, then filled and sticky.
- [ ] `RecipePickerModal` runs on the shared `Sheet` with working title
      search, focus trap, and Escape close.
- [ ] `×` remove control has a 44×44 hit area via `IconButton`, same
      `aria-label` text.
- [ ] `pwa-planning.spec.ts` and `LocalPlanning.test.tsx` pass unmodified
      in their accessible-name assertions, or this plan's PR includes the
      exact listed edits alongside the behavior change.
