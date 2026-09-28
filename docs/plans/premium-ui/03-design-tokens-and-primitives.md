# Plan 03 — Design tokens and UI primitives

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner

## Goal

Give the `/app` PWA a semantic token layer and a small set of shared primitives (`Button`, `IconButton`, `Card`, `Sheet`, `Dialog`, `Menu`) in `frontend/src/components/ui/` so every later premium-ui plan (01, 02, 04–10) styles from the same vocabulary instead of hand-rolled Tailwind strings and duplicated overlay logic. This plan does not change any visible copy, route, or test selector.

## Current state

- `frontend/src/app/globals.css:3-23` — a single `@theme inline` block with 14 color tokens (`bg, paper, paper-2, ink, ink-soft, ink-mute, line, line-strong, terra, terra-soft, forest, forest-soft, warn, warn-soft`) and 2 font tokens (`--font-sans`, `--font-serif`). No radius, shadow, spacing, or motion tokens exist anywhere.
- `frontend/src/lib/typography.ts:1-2` — exactly two exports, `pageTitle` and `sectionTitle`; no body/caption/display scale, no tabular-nums helper.
- `frontend/src/app/layout.tsx:40` — `viewport.themeColor: "#C2613B"` duplicates `--color-terra` (`globals.css:13`) as an independent literal.
- `#A55230` (the terra hover-darken) is hard-coded 18 times across 16 files, e.g. `RecipeEditForm.tsx:406`, `RecipeDetail.tsx:211`, `RecipeReview.tsx:248`, `TimerSheet.tsx:98`.
- Raw Tailwind `red-*` appears ~25 times across 11 files (`ShoppingListView.tsx`, `AddFromRecipesModal.tsx`, `RecipeEditForm.tsx`, `RecipeDetail.tsx`, `CookMode.tsx`, `PantryView.tsx`, …); raw `green-*` appears 4 times in `ShoppingRow.tsx:52` and `ShoppingListView.tsx:40`.
- Radius is split five ways: `rounded-xl` (73), `rounded-full` (40), `rounded-lg` (29), `rounded-2xl` (24), `rounded-md` (5). Only 5 `shadow-*` usages exist total (`ServiceWorkerRegister.tsx:182`, `LocalScreens.tsx:87`, `CookStepView.tsx:65`, `IngredientsSheet.tsx:128`, `SavedConfirmation.tsx:8`).
- `frontend/src/components/ui/` does not exist yet.
- Overlay logic is reimplemented per file, inconsistently: `RecipePickerModal.tsx:20-23` closes on backdrop click only — no focus trap, no Escape. `TimerSheet.tsx:25-51` separately hand-rolls focus capture/restore, a body-scroll lock, and Escape, calling `lib/focus-trap.ts`'s `trapTabKey` (its only export, `frontend/src/lib/focus-trap.ts:3-23`) itself for Tab cycling. `AddFromRecipesModal.tsx` and `cook/IngredientsSheet.tsx` each repeat a variant.
- The pill CTA `rounded-full bg-terra px-{5,6} py-{2,2.5} text-sm font-semibold text-white` (plus a hard-coded `hover:bg-[#A55230]`) recurs with small variations at `LocalScreens.tsx:82`, `LocalImports.tsx:84`, `LocalImports.tsx:104`, `RecipeEditForm.tsx:406`, `RecipeDetail.tsx:211`, `RecipeReview.tsx:248`.

## Scope and non-goals

**In scope:** restructuring `globals.css` tokens; adding `Button`, `IconButton`, `Card`, `Sheet`, `Dialog`, `Menu` to `frontend/src/components/ui/`; replacing hard-coded `#A55230`/`red-*`/`green-*` with tokens; a lint/CI guard against new raw hex values.

**Non-goals:** dark-mode values (plan 09 owns the `[data-theme="dark"]` override block — this plan only makes tokens overridable); motion choreography beyond defining `--ease-*`/`--duration-*` (plan 06 applies them); recipe imagery (plan 02); any copy or route change; new dependencies (README constraint — zero animation/component libraries).

## Design

### 1. Token architecture: `@theme` vs `@theme inline`

`@theme` writes each variable as a real custom property on `:root` and generates utilities (`bg-terra`, `text-ink`, …) that reference `var(--color-terra)`. Because the utility is `var(...)`-backed, a later `:root[data-theme="dark"] { --color-terra: ... }` rule (plan 09) overrides every consumer with zero utility regeneration.

`@theme inline` is for values that are themselves references to a variable Tailwind doesn't manage — exactly `--font-sans: var(--font-manrope)`, where `--font-manrope` is a scoped custom property `next/font` attaches via a class on `<html>` (`layout.tsx:61`); Tailwind's own guidance calls this out for `next/font`-style integrations specifically. Using `inline` for plain color literals (as `globals.css` does today) gives no benefit and risks the utility baking in the literal instead of keeping the `var(--color-terra)` indirection plan 09 needs.

**Decision:** split the block. Plain `@theme` for every color/radius/shadow/motion token (needs runtime override); `@theme inline` only for the two font aliases. Verified on 2026-09-28 against the installed `tailwindcss` 4.3.0: a plain `@theme` color compiles to `.bg-bg { background-color: var(--color-bg) }` and a `[data-theme="dark"] { --color-bg: … }` rule overrides it; `@theme inline` fonts compile to `font-family: var(--font-manrope)`.

```css
@theme {
  --color-bg: #FAF7F2; /* …existing 14, unchanged values… */
  --color-terra-strong: #A55230;  /* names today's literal hover-darken */
  --color-danger: #B3261E;        /* replaces raw red-600/700 */
  --color-danger-soft: #F9DEDC;   /* replaces raw red-50/100 */
  --color-focus: #A55230;         /* 2px outline + 2px offset */

  /* Semantic names on purpose: Tailwind 4 already defines --radius-sm/md/lg,
     and redefining them would silently resize every existing rounded-sm/md/lg. */
  --radius-control: 0.5rem;  /* 8px: inputs, chips, icon buttons -> rounded-control */
  --radius-card: 0.75rem;    /* 12px: cards, buttons; same as today's rounded-xl -> rounded-card */
  --radius-sheet: 1.25rem;   /* 20px: sheets/dialogs -> rounded-sheet */
  /* rounded-full stays Tailwind's built-in utility for pills/avatars */

  --shadow-card: 0 1px 2px rgba(27,24,21,.04), 0 1px 1px rgba(27,24,21,.03);
  --shadow-raised: 0 4px 12px rgba(27,24,21,.08), 0 2px 4px rgba(27,24,21,.04);
  --shadow-overlay: 0 24px 48px rgba(27,24,21,.18), 0 8px 16px rgba(27,24,21,.08);

  --ease-out-soft: cubic-bezier(.16,1,.3,1);
  --ease-spring: cubic-bezier(.34,1.56,.64,1);
  --duration-fast: 120ms; --duration-base: 220ms; --duration-slow: 360ms;
}
@theme inline {
  --font-sans: var(--font-manrope);
  --font-serif: var(--font-instrument-serif);
}
```

`--color-danger`/`-soft` sit close to today's `red-600`/`red-50` so the visual change is near-zero; retune later if desired (open question below). `layout.tsx:40`'s `themeColor` moves into `export const TERRA_HEX = "#C2613B"` in a new `src/lib/theme.ts`, imported by `layout.tsx`, with a unit test asserting it equals the value tokenized in `globals.css` (Next's `Viewport.themeColor` needs a literal string, not a CSS var, so this keeps the two in sync without a runtime coupling).

Type scale, added to `typography.ts` alongside the untouched `pageTitle`/`sectionTitle`:
```ts
export const display = "font-serif text-4xl md:text-6xl font-semibold tracking-tight";
export const bodyText = "text-base leading-relaxed text-ink";
export const caption = "text-xs uppercase tracking-wide text-ink-mute";
export const tabularNums = "tabular-nums"; // Tailwind's built-in utility, named for reuse in timers/counts (TimerSheet.tsx:83)
```

### 2. Primitives (`frontend/src/components/ui/`)

- **`Button`** — `variant: "primary" | "secondary" | "ghost" | "danger"` (default `primary`), `size: "sm" | "md" | "lg"` (default `md`, `min-h-11`/44px matching today's repeated `min-h-11`), `href?: string` (renders `<a>`, no `asChild`), `loading?: boolean`, extends native button attrs minus `className`. `primary` = `rounded-full bg-terra text-white hover:bg-terra-strong`, replacing the six pill-CTA sites verbatim (same text, same tag when `href` is set).
- **`IconButton`** — square, 44×44 minimum hit area, required `aria-label` (not optional on the type), `icon: ReactNode`, `variant: "default" | "ghost"`. Replaces ad hoc close buttons like `TimerSheet.tsx:68-76`.
- **`Card`** — `interactive?: boolean`, `padding: "none" | "sm" | "md" | "lg"` (default `md`). Renders `border border-line bg-paper rounded-card shadow-card`; `interactive` adds `hover:shadow-raised` for the cookbook grid (`LocalScreens.tsx:87`).
- **`Sheet`** / **`Dialog`** — share one internal, unexported overlay (`src/components/ui/internal/Overlay.tsx`): focus capture on open and restore on close (`TimerSheet.tsx:27,31,40`), body-scroll lock while open (`TimerSheet.tsx:33-37`), Escape listener (`TimerSheet.tsx:44-51`), Tab cycling via the existing `trapTabKey` from `lib/focus-trap.ts` (reused, not rewritten — exactly what `RecipePickerModal.tsx` is missing today), backdrop click-to-close with the panel stopping propagation (`RecipePickerModal.tsx:20-26`), and `role="dialog" aria-modal="true"` plus a required `aria-label`/`aria-labelledby`. `Sheet` is bottom-anchored with safe-area padding on mobile, centered at `md:`; `Dialog` is always centered, narrower, and built to replace the native-`confirm` delete flow `frontend/context.md`'s "Recipe deletion" section describes (`onConfirm`, `variant: "default" | "danger"` — wiring is plan 05's job; this plan ships the component only).
- **`Menu`** — `trigger: ReactNode`, `items: { label; onSelect; danger? }[]`. V1 is click-outside + Escape close only (no roving-tabindex — see open questions) for the "⋯" actions the README calls out.

## Migration strategy

Ordered, PR-sized:

1. **Tokens only** — rewrite `globals.css`, add `src/lib/theme.ts`, extend `typography.ts`. No component changes; visual diff is zero because no new token reuses a Tailwind default name. Verify with `pnpm build` that no utility silently changed (spot-check `bg-terra`, `rounded-xl`, `rounded-lg` output).
2. **Primitives, unadopted** — add the six components plus co-located `__tests__/*.test.tsx` (matching the existing convention, not literal sibling files). Nothing imports them yet; reviewable purely as new, isolated code.
3. **Mechanical color sweep** — replace all 18 `#A55230` and the `red-*`/`green-*` occurrences with `terra-strong`/`danger`/`danger-soft`/`forest`/`forest-soft`, without adopting primitives. Include the legacy, nav-hidden `/prices` surface (`ZipSelector.tsx`) in this rename since it's the same low-effort sweep, even though it's excluded from primitive adoption below.
4. **Primitive adoption, screen by screen** — see inventory below, ordered by a11y risk (dialogs first) then visibility.

| File | Adopts | Note |
|---|---|---|
| `plan/RecipePickerModal.tsx` | `Sheet` | gains the focus trap + Escape it lacks entirely |
| `shopping/AddFromRecipesModal.tsx`, `cook/IngredientsSheet.tsx`, `cook/TimerSheet.tsx` | `Sheet` | drops each file's duplicated overlay logic |
| `recipe/RecipeDetail.tsx` | `Button`, `Dialog` | line 211 CTA; delete-confirm coordinates with plan 05 |
| `app/LocalScreens.tsx` | `Button`, `Card` | line 82 pill, line 87 grid — text/selector unchanged |
| `app/LocalImports.tsx`, `recipe/RecipeEditForm.tsx`, `recipe/RecipeReview.tsx`, `shopping/ShoppingAddForm.tsx`, `pantry/PantryAddForm.tsx`, `plan/PlanView.tsx`, `import/ImportFlow.tsx`, `login/page.tsx` | `Button` | mechanical CTA swap |
| `cook/CookStepView.tsx`, `cook/MarkOutOfStep.tsx`, `cook/CookMode.tsx`, `cook/CookDoneView.tsx` | `Button`, `IconButton` | coordinate with plan 04 |
| `pantry/PantryView.tsx` | `Button` (danger) | red- becomes `danger` variant |
| `shopping/ShoppingRow.tsx`, `shopping/ShoppingListView.tsx` | tokens only | small badges, no primitive needed |
| `components/prices/*`, `app/(app)/prices/page.tsx` | tokens only | legacy/hidden, no primitive adoption |

**Lint guard:** a core-ESLint (no new dependency) `no-restricted-syntax` rule in `eslint.config.mjs`, scoped to `frontend/src/**/*.{ts,tsx}`, matching `Literal`/`JSXAttribute` values against `/#[0-9A-Fa-f]{6}/`, with an override exempting `src/lib/theme.ts` (the one file allowed to hold the canonical literal). The hidden `/prices` chart (`components/prices/PriceHistoryChart.tsx`) passes eight hex colors to Recharts as SVG attributes; move them into `theme.ts` as named exports in the same PR rather than exempting the folder. Runs inside the existing `pnpm lint` gate, no new CI step.

## Tests and verification

- **Unit (new):** `Button` (variant/size classes, `href` renders `<a>`, `disabled`/`loading`), `IconButton` (44px hit-area class, `aria-label` passthrough), `Card` (`interactive` hover-shadow class), `Sheet`/`Dialog` (Escape closes, backdrop click closes, panel click does not, focus enters on open and restores on close, Tab cycles via `trapTabKey`), `Menu` (item `onSelect`, outside-click closes).
- **Existing tests likely touched:** `LocalScreens.boundary.test.tsx` and `LocalImports.test.tsx` (`app/__tests__/`) query the CTAs migrated in step 4 — confirm they still query by role/text (e.g. `"+ Add recipe"`, a protected selector) after the `Button` swap, not by class string.
- **Full CI gate (`docs/plans/premium-ui/README.md`, `CLAUDE.md` §5/§6):** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build`, `pnpm test:pwa` (Chromium); backend `ruff`/`mypy`/`pytest` are unaffected but still gate the whole-repo CI run.

## Risks and open questions

1. The `@theme`/`@theme inline` split is verified (see Design §1). Re-check if `tailwindcss` is upgraded past 4.3.
2. `--color-danger`/`-soft` hexes are placeholders matching today's `red-600`/`red-50`; confirm whether error color should instead be warm-palette-tinted like `--color-warn`.
3. `Menu` ships without arrow-key roving-tabindex in v1 (click/Escape only) — confirm that's acceptable, or pull full keyboard nav into this plan.

## Acceptance criteria

- [ ] `globals.css` has zero raw hex outside the token block; `layout.tsx` sources `themeColor` from `lib/theme.ts`, asserted equal to `--color-terra` by a unit test
- [ ] `terra-strong`, `danger`, `danger-soft`, `focus`, `radius-control/card/sheet`, `shadow-card/raised/overlay`, `ease-out-soft/spring`, `duration-fast/base/slow` all defined and consumed by at least one migrated file
- [ ] Zero remaining `#A55230` and zero raw `red-*`/`green-*` color utilities under `frontend/src/`
- [ ] `Button`, `IconButton`, `Card`, `Sheet`, `Dialog`, `Menu` exist in `frontend/src/components/ui/` with passing co-located tests
- [ ] `RecipePickerModal.tsx` has a working focus trap and Escape handling (currently has neither)
- [ ] ESLint `no-restricted-syntax` hex guard is active and passes on `pnpm lint`
- [ ] Full CI gate list above is green
