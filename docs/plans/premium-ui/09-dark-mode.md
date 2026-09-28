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
