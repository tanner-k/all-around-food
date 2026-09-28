# Plan 09: Dark mode

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 03 (design tokens and primitives)

## Goal

Ship a warm "espresso" dark theme with system default + manual override (light / dark / system), stored per device, with no flash of the wrong theme on `/app` load — offline and online, cold and warm start.

## Current state

- No dark variant exists anywhere: no `prefers-color-scheme`, no `.dark`, no `data-theme` attribute.
- Tokens are light-only, in `frontend/src/app/globals.css:3-23`, inside a Tailwind v4 `@theme inline { --color-*: ... }` block (bg `#FAF7F2`, paper `#FFFFFF`, paper-2 `#F3EEE3`, ink `#1B1815`, ink-soft `#5C544A`, ink-mute `#8C8579`, line `#E8E1D2`, line-strong `#C9C0AB`, terra `#C2613B`, terra-soft `#F3DCCF`, forest `#355E3B`, forest-soft `#DBE5D6`, warn `#B97A14`, warn-soft `#F5E2B8`). Plan 03 moves these into `:root` custom properties mapped into `@theme`; this plan assumes that and overrides the same properties for dark.
- `viewport.themeColor` is one static string, `"#C2613B"` (`layout.tsx:40`); `public/manifest.webmanifest:10-11` has fixed `background_color`/`theme_color` too — the manifest format has no media-query variant. `RootLayout` (`layout.tsx:53-111`) renders `<html>`/`<body>` with no manual `<head>` — nowhere today for a pre-hydration script.
- Settings persistence: `frontend/src/lib/local/schema.ts:62-66`'s `SettingKeySchema` (closed zod enum) writes through `saveSetting()` (`repository.ts:269-278`) into the IndexedDB `settings` store, which is **per account database** (`aaf-local:<ownerId>` vs guest `aaf-local`, `frontend/src/lib/local/db.ts:28-34`) and async — wrong for a device-level preference that must survive sign-in/out and be readable before first paint. Account **identity** (`OWNER_KEY`, `SIGNED_OUT_KEY`, same file) already lives in plain `localStorage` for exactly that reason.
- The service worker precaches `/app`'s full HTML itself, fetched fresh at install and keyed by `BUILD_ID` (`frontend/scripts/build-pwa-manifest.mjs:26-34`), not just JS/CSS/font assets — an inline script added to that HTML ships inside the cached document automatically, versioned through the existing `ServiceWorkerRegister.tsx` update flow.
- Audit — `text-white` on `bg-terra` (breaks once dark-mode `terra` brightens): `RecipeDetail.tsx:211`, `RecipeEditForm.tsx:406`, `CookMode.tsx:199,213,247,259`, `CookStepView.tsx:91,119`, `CookDoneView.tsx:79`, `TimerSheet.tsx:98`, `MarkOutOfStep.tsx:77,139`, `LocalScreens.tsx:82`, `LocalImports.tsx:84,104`, `ServiceWorkerRegister.tsx:184`, `PantryRow.tsx:7-9`, `MarkOutOfStep.tsx:13-15`, `ShoppingRow.tsx:23`. No `bg-white` literal exists; no custom `box-shadow`/`rgba` yet (bare `shadow-md`/`shadow-lg`) — plan 03's shadow tokens cover that, not this plan.
- `frontend/src/components/ui/` doesn't exist yet (plan 03 creates it); `frontend/src/lib/focus-trap.ts` already does.

## Scope and non-goals

**In scope:** dark values for the full `--color-*` set (including contract additions `terra-strong`, `danger`, `danger-soft`, `focus`), the light/dark/system setting and storage, FOUC prevention, per-scheme `theme-color`, iOS status bar, the `dark:` Tailwind variant, and the `text-white`-on-`terra` contrast fix.

**Non-goals:** shadows/radii (plan 03), theme-transition animation (plan 06), cook mode's own dark timing (plan 04), and `/prices` (Recharts), which stays light-only.

## Design

### 1. Espresso dark palette

Values computed against WCAG contrast math, not estimated.

| Token | Light | Dark (espresso) |
|---|---|---|
| `bg` | `#FAF7F2` | `#1C1512` |
| `paper` | `#FFFFFF` | `#241A15` |
| `paper-2` | `#F3EEE3` | `#2E211A` |
| `ink` | `#1B1815` | `#F3EAE0` |
| `ink-soft` | `#5C544A` | `#C9B8A8` |
| `ink-mute` | `#8C8579` | `#93816F` |
| `line` | `#E8E1D2` | `#3A2C22` |
| `line-strong` | `#C9C0AB` | `#4E3C2E` |
| `terra` | `#C2613B` | `#E08055` |
| `terra-soft` | `#F3DCCF` | `#3B241A` |
| `terra-strong` (replaces hard-coded `#A55230`) | `#A55230` | `#F2946A` |
| `forest` | `#355E3B` | `#7FAE7A` |
| `forest-soft` | `#DBE5D6` | `#253327` |
| `warn` | `#B97A14` | `#E0A542` |
| `warn-soft` | `#F5E2B8` | `#3A2E14` |
| `danger` (new — propose light `#C0392B`) | `#C0392B` | `#E2604F` |
| `danger-soft` (new — propose light `#F5D9D2`) | `#F5D9D2` | `#331A16` |
| `focus` (new — propose light `= terra`) | `#C2613B` | `#F0A868` |

`paper` is *lighter* than `bg` in both themes (elevation reads as "lifted"); `paper-2` sits one step lighter again. `ink`/`ink-soft`/`ink-mute` are warm off-whites, not pure white/gray.

| Pair (dark) | Ratio | Target | Pass |
|---|---|---|---|
| `ink` on `bg` | 15.15:1 | 4.5:1 | Yes |
| `ink-soft` on `bg` | 9.36:1 | 4.5:1 | Yes |
| `ink-mute` on `bg` | 4.81:1 | 4.5:1 | Yes |
| `ink` on `paper` | 14.31:1 | 4.5:1 | Yes |
| `terra` on `bg` | 6.34:1 | 4.5:1 | Yes |
| `terra` on `terra-soft` | 5.08:1 | 4.5:1 | Yes |
| `forest` on `forest-soft` | 5.21:1 | 4.5:1 | Yes |
| `warn` on `warn-soft` | 6.09:1 | 4.5:1 | Yes |
| `danger` on `danger-soft` | 4.63:1 | 4.5:1 | Yes |
| `focus` on `bg`/`paper` | 9.02:1 / 8.52:1 | 3:1 | Yes |
| **`white` on `terra`** | **2.84:1** | 4.5:1 | **Fails** |
| `ink` on `terra` | 6.34:1 | 4.5:1 | Yes |

The failure is the real finding: `bg-terra text-white` is already borderline in light mode (4.14:1, below AA for the small button labels used across the app) and fails outright once `terra` brightens for dark-background legibility. Fix: dark-mode terra-filled controls use `ink`-colored labels, not `white` — a token-level swap (`text-white` → an "on-terra" color resolving to `white`/`ink` per theme) plan 03's `Button` should own long-term; this plan patches today's raw call sites since they ship before primitives land everywhere. Whether to also fix the light-mode 4.14:1 pair is an owner decision; see Risks. `line`/`line-strong` stay low-contrast on `bg` in both themes (dark 1.34:1/1.72:1, light 1.22:1/1.69:1) — matches the existing hairline-divider intent, not a required boundary.

### 2. Theme setting: storage and resolution

Store the raw preference (`"light" | "dark" | "system"`, default `"system"`) in `localStorage` (key `aaf-theme`), not the IndexedDB `settings` collection — that store is per-account-database and async, wrong for a preference that must survive sign-in/out and resolve before first paint. Mirrors the existing `OWNER_KEY`/`SIGNED_OUT_KEY` pattern. A new `frontend/src/lib/theme-preference.ts` (plan 03 already uses `lib/theme.ts` for the canonical hex values; the dark `theme-color` hex goes there too, keeping plan 03's lint guard intact) owns the key, `resolveTheme()` (raw → effective `"light"|"dark"` via `matchMedia` for `"system"`), and `setThemePreference()` (writes `localStorage`, sets `document.documentElement.dataset.theme`). UI: a Light/Dark/System control colocated near `frontend/src/components/settings/DataSettings.tsx`, no backend calls.

### 3. No flash of wrong theme

Two layers: (1) pure CSS — dark values under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again unconditionally under `:root[data-theme="dark"]`; correct at first paint with zero JS for the system default. (2) An inline script, since Tailwind's `dark:` variant (`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`) keys off the `data-theme` attribute. The script always writes the *resolved* theme (`"light"` or `"dark"`, including for the `"system"` preference) and `theme-preference.ts` updates it on `matchMedia` change events. Otherwise `dark:` utilities would apply to a manual Dark choice but not to system dark mode. The CSS media-query layer stays as the no-JS fallback. Add an explicit `<head>` to `RootLayout` with `<script dangerouslySetInnerHTML>` reading `localStorage.aaf-theme` (inside `try/catch`, falling back to `"system"`) and setting the attribute synchronously before `<body>`. The app sends no Content-Security-Policy today (checked `next.config.ts`, `middleware.ts`, `layout.tsx`); if one is added later, this script needs a nonce or hash. Because `/app`'s HTML is precached whole (see Current state), this ships automatically and any edit bumps `BUILD_ID`, surfaced via the existing update flow.

### 4. `theme-color` and iOS status bar

Replace `viewport.themeColor` with Next's media-array form (`light` → `#C2613B`, `dark` → `#1C1512`), rendered as two `<meta name="theme-color" media="...">` tags — covers system default with zero JS; `setThemePreference()` also writes `content` at runtime for manual overrides. `manifest.webmanifest`'s static `theme_color`/`background_color` stay light-only (splash screen, no media-query equivalent) — an accepted platform limitation. iOS status bar (`appleWebApp.statusBarStyle`) is fixed at launch. Plan 07 switches it to `"black-translucent"` with safe-area padding on the header, so the bar shows the active theme's own header colour; this plan depends on that and does not repeat it.

## Implementation steps

**PR 1 — tokens and CSS wiring** (after plan 03's `:root`/`@theme` restructure lands)
1. Dark values for all 18 tokens under the two guarded blocks, in `globals.css`; add `@custom-variant dark`.
2. Add `frontend/src/lib/theme-preference.ts`.
3. Inline pre-hydration script + `<head>` in `layout.tsx`; fill the dark entry of the media-array `themeColor`. The `black-translucent` status bar, header safe-area padding and the light/dark `themeColor` array itself are plan 07's; if 07 hasn't shipped, land them here exactly as 07 specifies.

**PR 2 — manual override UI + audit fixes**
4. Light/Dark/System control near `DataSettings.tsx`.
5. Fix `text-white`-on-`terra` at each audited site.
6. Spot-check `forest`/`warn`/`ink-mute` pill fills (`PantryRow.tsx`, `MarkOutOfStep.tsx`, `ShoppingRow.tsx`) visually against the new dark values (they already pass numerically).

## Tests and verification

- Unit (vitest): `theme.ts` — read/write, `system` resolution against mocked `matchMedia`, invalid/missing value falls back to `system`.
- Unit/component: new settings control renders three options, calls `setThemePreference` correctly; no protected selector text (CLAUDE.md §Constraints) changes.
- `pnpm test:pwa`: set `localStorage.aaf-theme = "dark"` before navigation, assert `data-theme="dark"` on first paint; offline-reload case confirming the script still runs from the cached document.
- Manual (not CI-provable): physical iPhone/iPad — status bar tracks theme, no flash on cold home-screen launch.

## Risks and open questions

1. Should this plan also fix the pre-existing light-mode `white`-on-`terra` failure (4.14:1) it surfaced, or leave light-mode visuals untouched and file separately?
2. `paper` lighter than `bg` in dark mode is an elevation choice, not a literal inversion of light mode — confirm against `docs/design/` references before PR 1 merges.

## Acceptance criteria

- [ ] All 18 color tokens have dark `:root` overrides passing the contrast table.
- [ ] `system` theme applies correctly with JavaScript disabled.
- [ ] Manual choice persists across reload/sign-out, no flash, including offline from the SW cache.
- [ ] `theme-color` and iOS status bar track the active scheme.
- [ ] Every `text-white`-on-`terra` site passes 4.5:1 in dark mode.
- [ ] `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` all pass.


## Implementation notes

Branch `claude/premium-ui-09-dark-mode`, cut from `b895973` (wave 2 merged). Wave 3, in parallel with plan 06. Two subagents worked on separate sets of files: one on the theme setting, the head script and the Settings control, and one on the color audit. I did the palette, the contrast test and the primitives, then reviewed their diffs before committing.

### Shipped

- `6b0f900` **Palette and contrast test.**
  - `globals.css` adds a delimited `Dark theme (plan 09)` block. It defines dark values for every `--color-*` and `--shadow-*` token under `:root[data-theme="dark"], [data-cook-theme="dark"]`, and a second, identical copy under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` as the no-JavaScript fallback. It also sets `color-scheme` per theme and defines `@custom-variant dark` on `[data-theme="dark"]` and `[data-cook-theme="dark"]`.
  - Light-mode contrast fix in the `@theme` block: `terra-strong` is `#9A4A2B` (was `#A55230`), there is a new `terra-deep` `#8A4125`, and `focus` follows `terra-strong`. `terra` stays `#C2613B`.
  - New tokens: `on-accent` (text and glyphs on a filled accent: white in light, espresso in dark) and `scrim` (the overlay backdrop: ink at 40% in light, black at 60% in dark).
  - `Button` primary is `bg-terra-strong text-on-accent hover/active:bg-terra-deep`, and danger uses `text-on-accent`. The only change in `Overlay.tsx` is `bg-ink/40` → `bg-scrim`.
  - `THEME_COLOR_DARK_HEX` is `#1C1512`, the dark `bg`. `theme.test.ts` asserts that match.
  - Cook mode's kitchen block no longer has its own hex set or backdrop override. `[data-cook-theme="dark"]` is in the dark block's selector, so the kitchen toggle uses the app's dark values. Its `cook-rise` animation is unchanged.
  - New `lib/__tests__/contrast.test.ts` reads both themes from `globals.css`. It computes WCAG ratios for 41 pairs the app renders (the table below): small text needs at least 4.5:1, large text and non-text UI at least 3:1. It also checks that the dark block overrides every light color token, and that the two dark copies are identical, shadows and scrim included.
- `3b1b0c2` **Audit** (class names only; no copy or roles changed):
  - Every `text-white` on a filled accent is now `text-on-accent`: pantry and out-of-stock pills, the update toast, the checkbox tick, and cook mode's toggle and timer pill.
  - Filled terra that carries a label is now `bg-terra-strong`, with `hover:bg-terra-deep`. That covers "+ Add recipe", the DropZone, ZipSelector and prices submit buttons (which were `text-paper`, and that also fails in dark), the Step/Scroll toggle, and the running timer pill.
  - Small terracotta text is now `text-terra-strong`: links, eyebrows, chips on `terra-soft`, inline and ingredient amounts, the active tab label, the brand mark (20px), today's weekday, queue status pills, and small `<em>` accents inside `text-xl` headings.
  - `terra` stays on display type at 24px and up (SectionHeader, the recipe title, modal titles, serif step numbers, the active cook step number), on icons and borders, and on icon-only fills.
  - The unchecked checkbox border moves from `line-strong` (1.7:1) to `ink-mute`.
  - Raw `shadow-sm`/`shadow-lg` become `shadow-card`/`shadow-overlay`, so they darken with the theme.
- `6c770e2` **Setting and no-flash script.**
  - New `lib/theme-preference.ts`. The preference (`light`, `dark` or `system`, default `system`) lives in `localStorage` under `aaf-theme`. It is per device, so it survives sign-in and sign-out and is readable before first paint.
  - It exports `readThemePreference`, `resolveTheme`, `applyTheme`, `setThemePreference`, `subscribeThemePreference` (for `useSyncExternalStore`, including other tabs) and `themeInitScript()`.
  - `layout.tsx` inlines that script in an explicit `<head>`, with `suppressHydrationWarning` on `<html>`. The script always writes the **resolved** theme to `data-theme`, including for System. It follows `matchMedia` changes while the preference is System, and `storage` events from other tabs.
  - For a manual choice it sets every `theme-color` meta to that scheme's color. For System it restores each meta's color from its `media` attribute.
  - New `components/settings/ThemeSettings.tsx`: an "Appearance" card in Settings, right after "Install for offline use". It is a Light/Dark/System `radiogroup` with 44px options, a roving tabindex, and Arrow, Home and End keys.
  - Settings' forest buttons and "Your data" eyebrow use the new tokens.
  - Tests: `theme-preference.test.ts` (19, which run the inline script itself against stored dark and light, System dark and light, a garbage value, storage that throws, no `matchMedia`, a live scheme change and the legacy `addListener`), `ThemeSettings.test.tsx` (4), and the new `e2e/pwa-theme.spec.ts` (4). The e2e spec covers a stored dark theme on first paint, System following the emulated scheme live and after reload, a Settings choice that survives a reload and an offline reload from the service-worker cache, and JavaScript disabled with a dark scheme still painting the dark background.
- `9046ef8` The theme options' icons no longer shrink at 360px.

### Final palette

| Token | Light | Dark |
|---|---|---|
| `bg` | `#FAF7F2` | `#1C1512` |
| `paper` | `#FFFFFF` | `#241A15` |
| `paper-2` | `#F3EEE3` | `#2E211A` |
| `ink` | `#1B1815` | `#F3EAE0` |
| `ink-soft` | `#5C544A` | `#C9B8A8` |
| `ink-mute` | `#6F685D` | `#A08D7A` |
| `line` | `#E8E1D2` | `#3A2C22` |
| `line-strong` | `#C9C0AB` | `#4E3C2E` |
| `terra` | `#C2613B` | `#E08055` |
| `terra-soft` | `#F3DCCF` | `#3B241A` |
| `terra-strong` | `#9A4A2B` | `#F2946A` |
| `terra-deep` | `#8A4125` | `#F7A987` |
| `forest` | `#355E3B` | `#7FAE7A` |
| `forest-soft` | `#DBE5D6` | `#253327` |
| `warn` | `#8A5A0B` | `#E0A542` |
| `warn-soft` | `#F5E2B8` | `#3A2E14` |
| `danger` | `#B3261E` | `#EC7463` |
| `danger-soft` | `#F9DEDC` | `#331A16` |
| `focus` | `#9A4A2B` | `#F0A868` |
| `on-accent` | `#FFFFFF` | `#1C1512` |

`scrim` is `rgb(27 24 21 / 0.4)` in light and `rgb(0 0 0 / 0.6)` in dark. Dark shadows use black at 0.3–0.6, the same values plan 04's kitchen block had.

### Contrast (asserted by `contrast.test.ts`)

| Pair | Use | Min | Light | Dark |
|---|---|---|---|---|
| `ink` on `bg` | body text (text) | 4.5 | 16.54 | 15.15 |
| `ink` on `paper` | cards, sheets, inputs (text) | 4.5 | 17.68 | 14.31 |
| `ink` on `paper-2` | hover rows, chips (text) | 4.5 | 15.28 | 13.09 |
| `ink` on `terra-soft` | ::selection, today row (text) | 4.5 | 13.42 | 12.15 |
| `ink-soft` on `bg` | descriptions (text) | 4.5 | 6.96 | 9.36 |
| `ink-soft` on `paper` | card descriptions (text) | 4.5 | 7.44 | 8.84 |
| `ink-soft` on `paper-2` | DropZone pills (text) | 4.5 | 6.43 | 8.09 |
| `ink-soft` on `terra-soft` | RecipeCover glyph (text) | 4.5 | 5.65 | 7.50 |
| `ink-soft` on `forest-soft` | RecipeCover glyph (text) | 4.5 | 5.74 | 6.90 |
| `ink-soft` on `warn-soft` | RecipeCover glyph (text) | 4.5 | 5.83 | 6.90 |
| `ink-mute` on `bg` | meta lines, eyebrows (text) | 4.5 | 5.15 | 5.65 |
| `ink-mute` on `paper` | card meta, empty states (text) | 4.5 | 5.51 | 5.34 |
| `ink-mute` on `paper-2` | queue pending badge, table header (text) | 4.5 | 4.76 | 4.88 |
| `terra-strong` on `bg` | links, eyebrows, amounts (text) | 4.5 | 5.80 | 7.91 |
| `terra-strong` on `paper` | links and labels in cards (text) | 4.5 | 6.20 | 7.47 |
| `terra-strong` on `paper-2` | hover text on paper-2 rows (text) | 4.5 | 5.36 | 6.84 |
| `terra-strong` on `terra-soft` | chips, active tab pill (text) | 4.5 | 4.71 | 6.34 |
| `forest` on `bg` | success text (text) | 4.5 | 6.98 | 7.07 |
| `forest` on `paper` | success text in cards (text) | 4.5 | 7.46 | 6.68 |
| `forest` on `forest-soft` | success chips and notices (text) | 4.5 | 5.75 | 5.21 |
| `warn` on `bg` | warnings (text) | 4.5 | 5.54 | 8.26 |
| `warn` on `paper` | warnings in cards (text) | 4.5 | 5.92 | 7.81 |
| `warn` on `warn-soft` | grade chips (text) | 4.5 | 4.64 | 6.09 |
| `danger` on `bg` | errors (text) | 4.5 | 6.12 | 6.22 |
| `danger` on `paper` | errors, danger menu item (text) | 4.5 | 6.54 | 5.87 |
| `danger` on `danger-soft` | error notices (text) | 4.5 | 5.14 | 5.57 |
| `on-accent` on `terra-strong` | primary Button, filled pills (text) | 4.5 | 6.20 | 7.91 |
| `on-accent` on `terra-deep` | primary Button hover/active (text) | 4.5 | 7.33 | 9.42 |
| `on-accent` on `forest` | In stock pill, backup buttons (text) | 4.5 | 7.46 | 7.07 |
| `on-accent` on `warn` | Low pill (text) | 4.5 | 5.92 | 8.26 |
| `on-accent` on `ink-mute` | Out pill (text) | 4.5 | 5.51 | 5.65 |
| `on-accent` on `danger` | danger Button (text) | 4.5 | 6.54 | 6.22 |
| `terra` on `bg` | serif headings, step numbers (large) | 3 | 3.88 | 6.34 |
| `terra` on `paper` | serif headings in cards and sheets (large) | 3 | 4.14 | 5.99 |
| `terra` on `bg` | icons, progress, checked checkbox (ui) | 3 | 3.88 | 6.34 |
| `terra` on `paper` | checked checkbox, borders (ui) | 3 | 4.14 | 5.99 |
| `on-accent` on `terra` | checkbox tick (ui) | 3 | 4.14 | 6.34 |
| `ink-mute` on `paper` | unchecked checkbox boundary (ui) | 3 | 5.51 | 5.34 |
| `focus` on `bg` | focus ring (ui) | 3 | 5.80 | 9.02 |
| `focus` on `paper` | focus ring in cards (ui) | 3 | 6.20 | 8.52 |
| `focus` on `paper-2` | focus ring on paper-2 (ui) | 3 | 5.36 | 7.79 |

### Deviations

- **Light `ink-mute` and `warn` also changed.** The owner decision named only terracotta, but the contrast test it asked for fails on two more light tokens the app uses for small text:
  - `ink-mute` `#8C8579` gives 3.42:1 on `bg`. It is used about 100 times for meta lines and captions. It is now `#6F685D` (5.15:1 on `bg`, 4.76:1 on `paper-2`).
  - `warn` `#B97A14` gives 3.59:1 on `paper`, and white on the "Low" pill gives 3.59:1. It is now `#8A5A0B` (5.92:1 on `paper`, 4.64:1 on `warn-soft`).
  - Both are visibly a little darker. Relaxing the test for them would have been loosening it.
- **Dark values that differ from the plan's table:**
  - `ink-mute`: `#93816F` → `#A08D7A`. The plan's value is 4.16:1 on `paper-2`.
  - `danger`: `#E2604F` → `#EC7463`. The plan's value is 4.46:1 on `paper-2`.
  - Everything else matches the plan.
- **`terra-strong` and `terra-deep` in dark are brighter than `terra`**, not darker. They keep their role (small accent text and the fill carrying a label), and in dark mode that role needs more luminance. The fill's hover (`terra-deep`) goes lighter again.
- **Labels on filled accents use one token, `on-accent`,** rather than an on-terra token only. Forest, warn, ink-mute and danger fills all turn bright in dark mode, so the same swap applies to every filled accent.
- **Kitchen toggle.** I kept the toggle and pointed it at the app's dark values rather than removing it. With the app already dark, turning it on changes nothing visible, and its Moon icon stays unpressed. The `body[data-cook-theme]` mirroring in `CookMode.tsx` is still needed, because the kitchen attribute isn't on `<html>`.
- **Hairlines stay hairlines.** `line`/`line-strong` are 1.2–1.7:1 on purpose, per the plan. The unchecked checkbox, whose boundary is its only cue, moved to `ink-mute`. The secondary `Button` border is still `line-strong`; its label identifies it, so it isn't in the 3:1 set.
- **`manifest.webmanifest` stays light-only.** The format has no per-scheme colors.
- **Test changes:** `Button.test.tsx`, `Dialog.test.tsx` and `PlanView.test.tsx` now assert `bg-terra-strong`/`hover:bg-terra-deep` instead of `bg-terra`/`hover:bg-terra-strong`. No assertion was loosened. No copy or roles changed.

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`, on `9046ef8`:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 71 files, 612 tests pass (baseline 503; 109 new: 85 in `contrast.test.ts` (41 pairs × 2 themes, plus 3 definition checks), 1 theme literal, 19 theme-preference, 4 ThemeSettings).
- `pnpm build`: pass, with CI's public env.
- `pnpm test:pwa`: 14/14 pass (10 existing and 4 new in `pwa-theme.spec.ts`), using the headless-shell shim from `IMPLEMENTING.md`.
- **Screenshots** against the production build at 393×852 and 1280×860, in light and dark: plan, cookbook, recipe detail, cook mode, shop, pantry, settings, the open recipe-picker `Sheet` and the delete `Dialog`, plus the kitchen toggle on a light app. The scrim darkens the page in both themes. Cover initials read clearly on all three dark tints. Primary fills are `terra-strong` with a dark label in dark mode. There is no horizontal overflow; the theme control fits at 360px.

### Handoffs

- **Plan 06 (motion), running in parallel:**
  - My hunks in shared files are color-only. In `Button.tsx`, it's the `primary` and `danger` entries of `variants`. In `Overlay.tsx`, it's `bg-ink/40` → `bg-scrim` in the backdrop class. In `globals.css`, it's color lines in `@theme` plus my own delimited block at the end.
  - I also trimmed the cook block's header comment and removed its token and backdrop rules. `cook-rise` is untouched, so expect a small merge there if you fold it into the motion tokens.
  - A theme-switch transition, if you want one, belongs to you. The plan leaves it out.
- **Plan 04 (cook) / coordinator:** optionally hide the kitchen toggle while `html[data-theme="dark"]`, or make it a three-state control, since it is a no-op in app dark mode.
- **Plan 03 (primitives):** the secondary `Button` border is `line-strong` (about 1.7:1). It is fine by WCAG because the label identifies the control, but raise it if a stronger outline is wanted.

### Needs a device

- No flash on a cold home-screen launch on iPhone and iPad, offline and online, with Dark, Light and System chosen.
- `theme-color` and the `black-translucent` status bar: the status bar shows the espresso header in dark mode, and whether iOS standalone ignores `theme-color` (Safari tabs use it).
- Switching the iOS appearance while the app is open: System follows it live through the `matchMedia` listener.
- `color-scheme: dark` on native controls (the file input, selects, the date picker) in iOS Safari.
- Legibility of the dark palette on a real OLED screen in low light, and of the kitchen mode in a real kitchen.
