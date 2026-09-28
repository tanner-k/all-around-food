# 05 · Recipe detail hierarchy and actions

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 03 (design tokens and UI primitives)

## Goal

Turn `RecipeDetail` from a flat stack of four equal-weight buttons and
duplicated metadata into a page with one clear primary action, a real
ingredient list, and inline step amounts that don't compete with body text —
using plan 03's primitives (`Button`, `IconButton`, `Menu`, `Dialog`) instead
of ad hoc markup.

## Current state

`frontend/src/components/recipe/RecipeDetail.tsx` (218 lines):

- **Action row (191–215):** four buttons stretched full-width on mobile by
  default flex behavior (no `w-full` needed): `Edit` (194–197, outline),
  `Delete recipe` (198, outline, `text-warn`, same weight as Edit), `Mark
  cooked` (200–207, outline), `Start cook mode →` (208–214, filled
  `bg-terra`). No visual primary action.
- **Delete confirm (line 88):** `handleDelete` calls `window.confirm(...)`
  directly — native dialog, untestable except via mocking `window.confirm`.
- **Glyphs:** `⏱` (59), `"Cooked ✓"` (206), `"Start cook mode →"` (213).
- **Duplicated time:** `breadcrumb` (48–50, rendered 98–102, `uppercase
  tracking-wide`) is `"{course} · {time} min"` (e.g. "MAIN · 45 MIN");
  `metaPills` (58–65, rendered 114–120) separately adds `⏱ {time} min`,
  `serves N`, kcal, difficulty. Time shows twice.
- **`IngredientRow` (24–40):** `· {name} {as_written chip} {preparation}
  {optional}`. `quantity.as_written` routinely repeats the name (e.g. name
  "crushed tomatoes", chip "28 oz crushed tomatoes" — see
  `frontend/src/lib/__tests__/fixtures/recipe.ts`), because
  `IngredientSchema.quantity` (`frontend/src/lib/recipe-schema.ts:4-8,23-30`)
  stores `value: number|null`, `unit: string|null`, `as_written: string`
  side by side and the row only reads `as_written`. No quantity column.
- **Groups (67–78, 132–156):** already work — keep as is.
- **Inline step amounts:** `InlineAmountText.tsx` line 51 uses the *same*
  `bg-terra-soft text-terra … font-medium` chip style as the ingredient list,
  inside `text-sm` step body (RecipeDetail line 169) — two competing chips.
- **Layout:** single column, `max-w-3xl mx-auto`, no desktop arrangement.
- **No serving scaler:** `servings` only renders as a `serves N` pill (line
  60); nothing in `RecipeDetail`/`recipe-schema.ts` multiplies quantities.
  Genuinely new scope — see Scope below.
- **Tab bar overlap:** `frontend/src/app/(app)/_components/MobileTabBar.tsx`
  is `fixed bottom-0` (line 38) and stays visible on the recipe route (only
  hides for `cook`, lines 30–33). A new sticky footer must sit above it.

## Scope and non-goals

In scope: action hierarchy, delete confirmation UI, ingredient row layout,
meta-line dedupe, inline-amount styling, desktop two-column layout.

Out of scope: hero image (plan 02), motion (plan 06), dark mode (plan 09),
cook mode itself (plan 04). **Serving scaler is out of scope** — no scaling
logic exists anywhere today. This plan only leaves layout room for a future
`Servings: 4 [−] [+]` control near the `serves N` pill; the multiply/
reformat logic is a separate later plan.

## Design

**Action hierarchy** (replaces 191–215): sticky primary `Button
variant="primary" size="lg"` labeled **"Start cooking"** (dropping the
arrow — fill/position carry the affordance); secondary `Button
variant="secondary" size="lg"` "Mark cooked" / "Cooked ✓" once logged (keep
the checkmark — it's a state confirmation, unlike the arrow); overflow
`Menu` via an `IconButton aria-label="Recipe options"` ("⋯") with two items,
**Edit** (same `localHref("edit", recipe.id)` as today) and **Delete**
(opens the `Dialog`). On mobile, "Start cooking" pins above `MobileTabBar`
using the shared `--tabbar-height` value from plan 07
(`bottom: calc(var(--tabbar-height) + 0.75rem)`; see the README's shared
surfaces). On `md:`+ (`MobileTabBar` is `md:hidden`) it sits inline
at the end of the action row, no `sticky` needed.

**Dialog** replaces `window.confirm`: same copy as line 88, "Delete"
(`variant="danger"`) and "Cancel". `handleDelete`'s try/catch/error state
(87–93) is unchanged; only the confirmation gate moves from
`window.confirm(...)` to the `Dialog`'s open/confirm flow. The tombstone and
account-boundary semantics in `frontend/context.md` ("Recipe deletion") are
untouched — presentation-layer swap only.

**Meta line:** keep the uppercase breadcrumb as the one time display; drop
the redundant `⏱ {time} min` from `metaPills` (line 59). If `course` is
null the breadcrumb currently vanishes (48–50 filters falsy parts) — add a
bare `metaPills` time fallback so time isn't lost entirely.

**Ingredient rows:** two columns — a `tabular-nums` quantity column (e.g.
`w-20 shrink-0 text-right`) built from `quantity.value` + `quantity.unit`
when both are present, falling back to `as_written` only when they're
`null` (the real "unparsed" path — `withEditedAmount` in
`recipe-schema.ts:15-21` intentionally nulls them on freeform edits; cover
it with a fixture). Name + `preparation` move to a left-aligned column so
the name isn't repeated. `optional` becomes a muted suffix on the name
column, not the amount column. Groups keep their current heading.

**Step amounts:** `InlineAmountText.tsx` line 51 — lighter treatment than
the ingredient chip (drop `bg-terra-soft`, keep `text-terra font-medium`, or
a thin underline per `docs/design/screens-chosen.jsx:151-176`'s original
"orange underlined" intent) so it reads as running-text annotation, not a
second chip.

**Desktop layout:** `md:grid md:grid-cols-[minmax(260px,320px)_1fr]
md:gap-10` wrapping the ingredients + steps sections, matching
`docs/design/screens-chosen.jsx:127-184`'s two-pane intent. Ingredients get
`md:sticky md:self-start md:overflow-y-auto`; confirm the `top-*` offset
against any fixed header in `frontend/src/app/(app)/layout.tsx` before
hardcoding it.

## Implementation steps

1. **Ingredient row rewrite** (`RecipeDetail.tsx` `IngredientRow`, 24–40):
   two-column layout, value/unit formatting with `as_written` fallback,
   optional moved off the amount column. Check `frontend/src/components/cook/`
   for an existing amount formatter before writing a new one.
2. **Meta-line dedupe** — drop the redundant time pill (line 59), add the
   course-null fallback.
3. **Step amount restyle** — `InlineAmountText.tsx` line 51.
4. **Action row → primitives** (needs plan 03's `Button`, `IconButton`,
   `Menu`, `Dialog`): replace 191–215 with sticky primary + secondary +
   `Menu` (Edit, Delete) + `Dialog`; swap `handleDelete`'s confirm gate.
5. **Desktop two-column layout** — wrap ingredients (128–156) and steps
   (158–178) sections in the `md:grid` container.
6. **Test updates** (below) land with step 4, since that's what breaks
   existing selectors.

Steps 1–3 and 5 don't need plan 03 and can ship first if sequencing slips.

## Tests and verification

- **`frontend/src/components/app/__tests__/recipe-delete.test.tsx`** — all
  five tests click `screen.getByRole("button", { name: "Delete recipe" })`
  and mock `window.confirm`. After step 4: open the `Menu` first
  (`getByRole("button", { name: "Recipe options" })` → `getByRole
  ("menuitem", { name: "Delete" })`), then click the `Dialog`'s Delete/
  Cancel instead of stubbing `window.confirm`. The account-switch test
  (mutates state from inside the old confirm-mock callback) needs a new
  hook point — e.g. call `selectVerifiedAccount("other")` right before
  clicking the `Dialog`'s Delete button. The other tests' assertions on
  `sync_outbox`/`recipes` are unchanged — only the trigger sequence moves.
- **`frontend/src/components/app/__tests__/LocalApp.test.tsx`** (71–99):
  "Mark cooked" / "Cooked ✓" selectors are unaffected. `getByRole("link",
  { name: "Start cook mode →" })` (line 93) breaks once the label becomes
  "Start cooking" and/or the element becomes a `Button` (possibly
  `<button>` not `<a>`) — update role+name together, keep the existing
  `onStartCook` promise/error contract either way.
- **`frontend/e2e/pwa-recipe-copy.spec.ts`** (41–42): the
  `page.once("dialog", …)` native-dialog listener becomes dead code;
  replace with Menu → Delete → Dialog confirm.
- No dedicated `RecipeDetail.test.tsx` exists — consider adding one for
  quantity-column formatting (parsed and `as_written`-fallback), meta-line
  dedupe, and the menu/dialog delete flow in isolation.
- Run `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`
  before merge; spot-check `Menu`/`Dialog` keyboard focus trapping
  (`lib/focus-trap.ts`, shared with `Sheet`).

## Risks and open questions

- "Start cook mode →" isn't on the README's protected-string list but is
  asserted verbatim in `LocalApp.test.tsx:93` — a real breaking rename, not
  a free one; needs a coordinated test edit.
- The sticky offset depends on plan 07's `--tabbar-height`. If this plan
  ships first, add that variable to `globals.css` as the README describes
  rather than hard-coding `56px`.
- Confirm whether plan 03's `Menu` must close before `Dialog` opens, so the
  delete flow never has two overlays open at once.

## Acceptance criteria

- [ ] Exactly one primary CTA ("Start cooking") is visually dominant at all
      breakpoints.
- [ ] Delete is reachable only through the overflow `Menu`, confirmed via
      `Dialog`; deletion/tombstone behavior in `frontend/context.md`
      ("Recipe deletion") is unchanged.
- [ ] Total time appears exactly once on the page.
- [ ] Ingredient quantities render in a tabular-nums column, `value`/`unit`
      when parsed, `as_written` only when not.
- [ ] Inline step amounts are visually lighter than ingredient-list chips.
- [ ] Desktop (`md:`+) shows ingredients and steps side by side with a
      sticky ingredients column.
- [ ] `recipe-delete.test.tsx`, `LocalApp.test.tsx`, and
      `pwa-recipe-copy.spec.ts` are updated and passing.

## Implementation notes

Session scope: the whole plan, plus plan 10's items inside `RecipeDetail.tsx`. Branch `claude/premium-ui-05-recipe-detail`, cut from `ba270d8`. The hero block (the `bg-paper-2` 16:10 placeholder) is untouched for plan 02; the title stays a single `<h1>` for plan 06.

### Shipped

- `7819430` **Amount formatter.** New `lib/format-quantity.ts`: `formatIngredientAmount(quantity)` renders `value` + `unit` (common fractions such as `1½`, `¼`; simple unit plurals such as `2 slices`, `4 cloves`; abbreviations such as `tbsp`/`oz` unchanged) and falls back to `as_written` when `value` is null, which covers `withEditedAmount`'s freeform path. Nothing reusable existed: `cook/` has no formatter, and `shopping-logic.ts`'s `formatNumber`/`displayUnit` are private and canonicalize units for aggregation. Tests in `lib/__tests__/format-quantity.test.ts`.
- `adf4de4` **Recipe detail.**
  - **Actions.** One action row after the description: secondary `Button size="lg"` "Mark cooked" (then "Cooked ✓", with the ✓ `aria-hidden`), a `Menu label="Recipe options"` with **Edit** (navigates to the same `localHref("edit", id)`) and **Delete** (danger item), and the primary `Button size="lg" href=…` "Start cooking". On phones the row wrapper is `display: contents`, so "Start cooking" becomes the last item in the page column (`order-last`) and is `sticky` at `bottom: calc(var(--tabbar-height, calc(3.5rem + env(safe-area-inset-bottom))) + 0.75rem)`, full width with `shadow-raised`. From `md:` it is `static` and sits at the end of the row (`md:ml-auto`). The `onStartCook` promise/error contract is unchanged.
  - **Delete.** `Dialog variant="danger"` titled "Delete recipe?" with the old confirm copy as its description, "Delete" and "Cancel". `handleDelete` only lost its `window.confirm` gate; its try/catch/error state is the same and it closes the dialog in `finally`. The `Menu` closes (and refocuses its trigger) before the `Dialog` opens, so two overlays are never open at once; the `Dialog` restores focus to the trigger. The deletion and tombstone path in `LocalScreens`/`repository` is untouched.
  - **Ingredients.** Two columns: a `w-20 text-right tabular-nums` amount column from `formatIngredientAmount`, then name, `, preparation` (muted) and a muted italic `optional` suffix. Hairline row dividers replace the `·` bullets. Groups keep their heading.
  - **Steps.** `InlineAmountText` gains `variant?: "chip" | "inline"` (default `"chip"`, so cook mode and `RecipeReview` render exactly as before). Recipe detail passes `"inline"`: plain `text-terra font-medium tabular-nums`, no background, and parsed amounts drop the repeated name ("garlic 4 cloves", not "garlic 4 cloves garlic"). Step numbers get a fixed `w-7` right-aligned column so the text lines up.
  - **Meta.** The `⏱ {time} min` pill is gone; the uppercase breadcrumb is the only time display. Pills are `tabular-nums`.
  - **Desktop.** Ingredients and steps sit in `md:grid md:grid-cols-[minmax(260px,320px)_1fr] md:gap-10`; ingredients are `md:sticky md:top-6 md:self-start md:max-h-[calc(100dvh-3rem)] md:overflow-y-auto`. The header in `app/layout.tsx` is not fixed or sticky, so `top-6` needs no header offset. The page widens from `max-w-3xl` to `lg:max-w-4xl` so the steps column isn't cramped.
  - **Plan 10 items.** `text-balance break-words hyphens-auto` on the title, `text-pretty` on step text, `tabular-nums` on pills, amounts and step numbers, `aria-hidden` ✓ with the shared `text-[1em] leading-none align-[-0.05em]` treatment, → dropped with the rename.
  - **Tests.** `recipe-delete.test.tsx` opens "Recipe options" → "Delete" and clicks the dialog's Cancel/Delete instead of mocking `window.confirm`; the account-switch test calls `selectVerifiedAccount("other")` after the dialog opens and before Delete. The `sync_outbox`/`recipes` assertions are unchanged. `LocalApp.test.tsx`: `link "Start cook mode →"` → `link "Start cooking"` and `button "Cooked ✓"` → `button "Cooked"`. `e2e/pwa-recipe-copy.spec.ts`: the native `dialog` listener is replaced by Menu → Delete → dialog Delete. New `components/recipe/__tests__/RecipeDetail.test.tsx` (7 tests): quantity column parsed and `as_written` fallback, time shown once with and without a course, Edit/Delete only in the menu, menu closes before the dialog, Cancel focused, cancel keeps the recipe, a failed delete closes the dialog and shows the alert, and inline step amounts carry no chip.

- Notes commit: this section, plus `frontend/context.md` ("Recipe deletion"): "native-confirmed" → overflow menu plus danger `Dialog`.

### Deviations

- **No time fallback pill.** The plan says the breadcrumb vanishes when `course` is null. It doesn't: it filters falsy parts, so a recipe with no course shows "45 MIN" alone. A fallback pill would have shown time twice, so it was not added, and because ⏱ had only that one site, no lucide `Timer` was needed here.
- **Sticky offset fallback.** The instructions suggested `var(--tabbar-height, 0px)`. With `0px`, "Start cooking" would sit under the 56px tab bar on phones until plan 07 merges, so the fallback is the tab bar's current height, `calc(3.5rem + env(safe-area-inset-bottom))`. Once plan 07 defines the variable (0px from `md:` and on cook routes) the fallback is never used; the button is `md:static` anyway.
- **Accessible name "Cooked".** Plan 10's `aria-hidden` on ✓ changes the button's name from "Cooked ✓" to "Cooked"; the one test that asserted it is updated.
- **Inline amounts.** Beyond restyling, the inline variant shows `value` + `unit` instead of `as_written`, because `as_written` repeats the ingredient name right after the matched name in the step text. Unparsed amounts still show `as_written`. Cook mode and review are unaffected (default `"chip"` variant).
- **Focus order on phones.** "Start cooking" is visually last (sticky) but follows the ⋯ button in DOM/tab order; that is the cost of one element serving both layouts without JavaScript.
- No subagents were used; the change is one component plus tests.

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`, with CI's public env and the Chromium shim from `IMPLEMENTING.md`:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 53 files, 431 tests pass (baseline 421; 10 new).
- `pnpm build`: pass. The arbitrary `bottom-[…]` compiles to `bottom: calc(var(--tabbar-height,calc(3.5rem + env(safe-area-inset-bottom))) + .75rem)`.
- `pnpm test:pwa`: 7/7 pass, including the updated `pwa-recipe-copy` delete at 375px and 812px.
- **Screenshots** against the production build, at 393×852 and 1280×860, of recipe detail at the top, scrolled, with the Menu open and with the Dialog open: no horizontal overflow; the sticky CTA clears the tab bar; the Dialog focuses Cancel; the desktop ingredients column stays pinned while the steps scroll.

### Handoffs

- **Plan 07:** the fixed "Offline ready" pill (`ServiceWorkerRegister.tsx`, `bottom-20 right-4`) overlaps the right end of the sticky "Start cooking" button on phones. When you move it onto `--tabbar-height`, lift it clear of sticky actions (roughly `calc(var(--tabbar-height) + 4.5rem)`) or let it dismiss. Plan 08's sticky "Review shopping →" will have the same overlap. Also, "Start cooking" assumes `--tabbar-height` includes the safe-area inset, per the README.
- **Plan 03 follow-up (components/ui, no wave 2 owner):** `Menu` always opens downward. On a phone with the page scrolled to the top, the "Recipe options" menu opens about 60px above the tab bar; both items stay visible and tappable, but a flip-up when there's no room below would be cleaner.
- **Plan 06:** the title is still a single `<h1>` (split into text plus `<em>`) for the `view-transition-name` hook.
- **Plan 02:** the hero block is unchanged. The page can now be `lg:max-w-4xl` wide, so a 16:10 cover grows to about 896×560 on desktop; cap its height in the hero block if that's too tall.

### Needs a device

- Sticky "Start cooking" above the tab bar with the home-indicator inset on an installed iPhone, and that it doesn't jitter during momentum scroll.
- The desktop sticky ingredients column on iPad in landscape (`md:` layout) with a long ingredient list, which scrolls inside `100dvh - 3rem`.
- `text-balance` and `hyphens-auto` on long titles in iOS Safari.
