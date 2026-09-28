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
