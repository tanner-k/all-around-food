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

## Implementation notes

Session scope: migration steps 1–3, the ESLint hex guard, and primitive adoption in the files `IMPLEMENTING.md` assigns to plan 03. Branch `claude/premium-ui-03-tokens-primitives`.

### Shipped

- `70867ca` **Tokens.** `globals.css` now has a plain `@theme` block for colors, radius, shadows and motion, and an `@theme inline` block only for the two `next/font` aliases. New tokens: `terra-strong`, `danger` (#B3261E), `danger-soft` (#F9DEDC), `focus`, `radius-control/card/sheet`, `shadow-card/raised/overlay`, `ease-out-soft/spring`, `duration-fast/base/slow`. A build check before and after the change showed `.bg-terra` went from a baked `#c2613b` to `var(--color-terra)`, and `--radius-lg`/`--radius-xl` still compile to `.5rem`/`.75rem`, so `rounded-lg`/`rounded-xl` are unchanged. New `lib/theme.ts` holds `TERRA_HEX` (used by `layout.tsx`'s `themeColor`) and the eight legacy `/prices` chart colors, which moved out of `PriceHistoryChart.tsx`. `typography.ts` gains `display`, `bodyText`, `caption` and `tabularNums`. New `lib/__tests__/theme.test.ts` checks that `TERRA_HEX` equals `--color-terra`, that every contract token is defined, and that Tailwind's own `--radius-sm/md/lg/xl` are not redefined.
- `8d8638e` **`Button`, `IconButton`, `Card`**, with tests.
- `12c7820` **`Menu`**, with tests (click and Escape only, per the owner decision).
- `3ac6ae8` **Color sweep and hex guard.** 64 class-only substitutions across 21 files: 32 × `[#A55230]` → `terra-strong`, `red-600/700/800` → `danger`, `red-50` → `danger-soft`, `border-red-300` → `border-danger/30`, `hover:text-red-500` → `hover:text-danger`, `green-700` → `forest`, `green-50/100` → `forest-soft`. `grep -rnE '(red|green)-[0-9]|A55230' src` now matches only the token comments in `globals.css`. `eslint.config.mjs` adds a core `no-restricted-syntax` rule on `src/**/*.{ts,tsx}` that rejects `#rrggbb` in string literals, template literals and JSX attributes. `src/lib/theme.ts` is the only exemption.
- `d895320` **`Sheet` and `Dialog`**, built on the shared internal `ui/internal/Overlay.tsx`, with tests.
- `7d34470` **Adoption:**
  - `Button` replaces the hand-rolled CTAs in `LocalImports.tsx` ("Enter a recipe manually" stays an `<a>` through `href`, plus "Import pasted text" and both "Retry"s), `RecipeEditForm.tsx` (Cancel link and Save), `RecipeReview.tsx` (Edit/Done and Save), `login/page.tsx`, `ShoppingAddForm.tsx`, `PantryAddForm.tsx` and `ShoppingListView.tsx` ("+ Add from recipes", "Mark as bought", "Complete shopping").
  - `AddFromRecipesModal.tsx` moves onto `Sheet`, which gives it a focus trap, Escape and focus restore.
  - `Card` wraps the aisle groups in `AisleSection.tsx` and the pantry groups in `PantryView.tsx`.
  - `IconButton` replaces the pantry row's `×`.
  - The login error text changes from `text-terra` to `text-danger`.
  - No visible copy, roles or tags changed, so no tests needed updating.

### Primitive API (for wave 2)

All primitives are in `@/components/ui/<Name>`, with named exports. Each one takes `className` for **layout only** (margin, alignment, flex or grid placement), never for color or shape.

```ts
// Button.tsx — also exports buttonClasses({ variant, size, fullWidth, className }) for rare non-button elements
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";   // default "primary"
type ButtonSize = "sm" | "md" | "lg";   // min-h-9 | min-h-11 (default, 44px) | min-h-14 (cook-mode size)
interface ButtonOwnProps {
  variant?: ButtonVariant; size?: ButtonSize;
  fullWidth?: boolean;      // w-full
  loading?: boolean;        // disabled + aria-busy + spinner before the label (label text is kept)
  className?: string;       // layout only
  children: ReactNode;
}
type ButtonProps =
  | (ButtonOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined }) // <button type="button"> by default
  | (ButtonOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & { href: string });   // renders <a>
// All variants are pill-shaped (rounded-full) with a focus-visible outline in --color-focus.
// primary = bg-terra text-white hover/active:bg-terra-strong; secondary = border-line-strong bg-paper;
// ghost = text-ink-soft hover:bg-paper-2; danger = bg-danger text-white. Button does not forward refs.

// IconButton.tsx — forwards ref
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-label"> {
  "aria-label": string;             // required
  icon: ReactNode;                  // wrapped in aria-hidden
  variant?: "default" | "ghost";    // default "ghost"; "default" adds border-line bg-paper
  className?: string;               // layout only
}   // size-11 (44×44), rounded-control

// Card.tsx
interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "className" | "children"> {
  interactive?: boolean;                     // adds hover/focus-within:shadow-raised
  padding?: "none" | "sm" | "md" | "lg";     // p-3 | p-4 md:p-5 (default) | p-6 md:p-8
  as?: "div" | "section" | "article" | "li"; // default "div"
  className?: string; children: ReactNode;
}   // rounded-card border-line bg-paper shadow-card

// Sheet.tsx — bottom sheet (rounded-t-sheet, max-h-[90dvh], safe-area bottom padding, drag handle) below md; centered rounded-sheet panel from md
type SheetProps = {
  open: boolean; onClose: () => void; children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;   // else first focusable, else the panel
  size?: "md" | "lg";                                // md:max-w-lg | md:max-w-2xl
} & ({ "aria-label": string; "aria-labelledby"?: never } | { "aria-labelledby": string; "aria-label"?: never });
// Sheet renders no header or close button: the consumer supplies its own content.

// Dialog.tsx — centered confirmation that replaces window.confirm; Cancel is focused on open
interface DialogProps {
  open: boolean;
  onClose: () => void;        // Cancel, Escape, backdrop
  onConfirm: () => void;
  title: string;              // h2, aria-labelledby
  description?: ReactNode;    // aria-describedby
  confirmLabel: string;
  cancelLabel?: string;       // default "Cancel"
  variant?: "default" | "danger";
  busy?: boolean;             // confirm shows loading, both buttons disabled, not dismissible
}

// Menu.tsx — renders its own ghost IconButton trigger
interface MenuItem { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }
interface MenuProps {
  label: string;              // trigger aria-label and menu aria-label
  trigger?: ReactNode;        // trigger icon; default lucide Ellipsis
  items: MenuItem[];
  align?: "start" | "end";    // default "end"
}
```

Overlay behavior shared by `Sheet` and `Dialog`:
- It portals to `document.body` with `role="dialog"` and `aria-modal`.
- It saves the focused element when it opens and restores it on close.
- It locks body scroll while open.
- Escape closes only the topmost open overlay.
- Tab cycles through `trapTabKey`.
- A backdrop click closes it; clicks inside the panel do not.
- To add a close control, render an `IconButton` inside the content.

Plan 06 adds `@starting-style` in `internal/Overlay.tsx` (the backdrop has `data-overlay-backdrop`) and press feedback in `Button` and `Card`.

`Menu` keeps focus behavior simple:
- Opening it focuses the first enabled item.
- Selecting an item or pressing Escape closes it and returns focus to the trigger.
- An outside click closes it without moving focus.

### Deviations

- **`className` on primitives.** The plan says Button takes native attrs "minus `className`". Every primitive instead takes `className` documented as layout-only, because adoption sites need `sm:ml-auto`, `mt-3`, `self-start` and grid placement. Without it, each would need a wrapper element. `Button` also gains `fullWidth`.
- **`Menu` owns its trigger.** The plan sketched `trigger: ReactNode`. `Menu` renders the trigger button itself so `aria-haspopup`, `aria-expanded` and `aria-controls` are always correct. `trigger` only sets the icon, and `label` is required.
- **Button shape.** All Button variants are pills (`rounded-full`). The shop and pantry "Add" buttons, the shopping-list actions and the login submit move from `rounded-xl` to pills. Cook mode's `rounded-xl min-h-14` buttons are plan 04's call: `size="lg"` matches their height.
- **`layout.tsx`.** The only change is `themeColor: "#C2613B"` → `themeColor: TERRA_HEX` plus its import, so the hex guard passes. That is part of the color sweep; the header was not touched.
- **Files left to their owners.** `ShoppingRow.tsx` and `ImportFlow.tsx` got the color sweep only, because plan 10 owns them. `RecipeReview.tsx`'s hero block was not touched (plan 02).
- **Step 4 table items not done here.** `RecipePickerModal`, `IngredientsSheet`, `TimerSheet`, `RecipeDetail`, `LocalScreens`, `PlanView` and the cook files belong to plans 08, 04, 05 and 07 in wave 2. So this branch does **not** yet meet the acceptance box "`RecipePickerModal.tsx` has a working focus trap": plan 08 moves it onto `Sheet`.
- **Formatting.** The Husky hook is not installed in this checkout (`core.hooksPath` is unset and `.husky/_` is missing), so lint-staged did not run on these commits; nothing was bypassed. New files follow the frontend's existing double-quote style rather than the repo-root `.prettierrc` (`singleQuote: true`). That config would reformat whole files if the hook ran on them, which is a pre-existing mismatch.

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`:
- `pnpm lint`: pass, including the new hex guard.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 51 files and 413 tests pass (baseline was 362; 51 are new).
- `pnpm build`: pass.
- `pnpm test:pwa`: 7/7 pass, but only after two changes to how it was run:
  - **Browser.** The preinstalled browser is build 1194, but the installed Playwright expects `chromium_headless_shell-1223`. I did not run `playwright install`. Instead I pointed `PLAYWRIGHT_BROWSERS_PATH` at a scratch directory that exposes the 1194 headless shell under the 1223 name.
  - **Build env.** It also needs CI's build env: `NEXT_PUBLIC_ACCOUNT_SYNC_STAGE=recipes`, `NEXT_PUBLIC_SUPABASE_URL=https://aaf-mock.supabase.co` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key`. Without them, `pwa-import.spec.ts` fails waiting for "Up to date", for reasons unrelated to this change.
- **Screenshots.** Taken at 393×852 and 1280×860 of shop, the shop "Add from recipes" sheet, pantry, import, new recipe and login, against the production build. The bottom sheet anchors correctly on the phone and centers on desktop. The Buttons and Cards render with the tokens, and nothing regressed visually.

### Handoffs

- **Plan 07** owns viewport metadata. `themeColor` now reads `TERRA_HEX` from `lib/theme.ts`, so keep that import when the light/dark `themeColor` array is added (plan 09 supplies the dark literal in `theme.ts`).
- **Plans 04, 05 and 08:** step 4 adoption in your files (see the table above). Use `Sheet` for `RecipePickerModal`, `IngredientsSheet` and `TimerSheet`. Use `Dialog variant="danger"` for recipe delete. `TimerSheet` and `IngredientsSheet` can delete their own focus, scroll-lock and Escape code once they are on `Sheet`.
- **Plan 10:** adopt `Button` or `IconButton` in `ShoppingRow.tsx` (the `×` remove) and `ImportFlow.tsx` if you want them.
- **Plan 01:** `LocalApp.tsx` changed on one line (line 52, the sync error box): `border-red-300 bg-red-50 text-red-800` → `border-danger/30 bg-danger-soft text-danger`. Nothing in `SyncStatus.tsx` or `DataSettings.tsx` needed changing.
- **Plan 09:** dark overrides go in a `[data-theme="dark"]` block that redefines the `--color-*` and `--shadow-*` tokens. No utility regeneration is needed.

### Needs a device

- `Sheet` safe-area bottom padding (`env(safe-area-inset-bottom)`) and `90dvh` max height on an installed iPhone, including with the keyboard open over the recipe list.
- iOS Safari body-scroll lock (`overflow: hidden` on `body`) while a Sheet is open, which is known to be imperfect on iOS.
- Tap targets: `IconButton` 44×44 and `Button` `sm` (36px) in real use.
