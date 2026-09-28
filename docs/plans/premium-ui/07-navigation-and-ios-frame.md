# Plan 07 — Navigation and the iOS standalone frame

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** Plan 03 (Button, IconButton, Menu, tokens)

## Goal

Make mobile navigation match the hierarchy the desktop header already has (four primary destinations + one quick-add + one settings action), give the active tab real visual weight instead of only a color change, and make the installed iOS app's status bar and theme color feel native.

## Current state

**Desktop header** (`frontend/src/app/layout.tsx:46-100`) already has the structure this plan proposes for mobile: `navLinks` (`Plan`/`Cookbook`/`Shop`/`Pantry`, lines 46-51) as plain text links (`hidden md:flex`, lines 79-88), a terracotta "+ Import" pill (lines 90-96), and a separate "Settings" text link (line 97). Desktop isn't the problem; it already has 4 tabs + 1 quick action + 1 settings link.

**Mobile tab bar** (`frontend/src/app/(app)/_components/MobileTabBar.tsx`) doesn't follow that pattern. `TABS` (lines 11-17) has 6 entries — Plan, Cookbook, Shop, Pantry, Import, Settings — as a `grid-cols-6` (line 40) of equal-weight icon+label buttons at `text-[11px]` (line 49). Active state (line 50) is `active ? "text-terra" : "text-ink-soft..."` on the whole `<a>`; the lucide `Icon` (`size={22}`) inherits `currentColor` so it does recolor, but there's no weight/fill/background difference — color is the only signal. `MobileTabBar` already hides on cook routes and updates active state on `hashchange` (lines 30-33, 41-43) — a pattern this plan reuses.

**Cookbook already has an in-content Import entry point**: `frontend/src/components/app/LocalScreens.tsx:82-83` renders both `"+ Add recipe"` and `"Import recipe"` at the top of the cookbook screen. Removing Import from the tab bar removes a *second*, mobile-only path to it, not the feature.

**iOS/PWA facts** (`layout.tsx`): `appleWebApp.statusBarStyle: "default"` (line 28) — opaque bar, content starts below it. `viewport.viewportFit: "cover"` (line 43) is set, but only `MobileTabBar.tsx:38` and `CookMode.tsx:179` use `env(safe-area-inset-bottom)`; nothing pads for `safe-area-inset-top` anywhere. `viewport.themeColor` (line 40) is a single static `"#C2613B"`. `frontend/public/manifest.webmanifest` has `background_color: "#FAF7F2"`, `theme_color: "#C2613B"`, three icons (192/512/512-maskable); `frontend/public/icons/` has no `apple-touch-startup-image` splash assets today.

**Hash routing**: `frontend/src/lib/local/navigation.ts`'s `localHref()`/`parseLocalRoute()` are independent of the tab bar — `#/import` and `#/settings` stay valid whether or not a tab points at them. Deep links and the top-level `/import`/`/settings` redirect routes are unaffected; only the navigational affordance changes.

## Scope and non-goals

In scope: `layout.tsx` header, `MobileTabBar.tsx`, `globals.css` (touch/overscroll), viewport/manifest metadata.
Non-goals: generating new splash-screen artwork (flagged below), dark-mode theme-color values (Plan 09), screen-content redesign.

## Design

1. **Four tabs, not six.** `MobileTabBar` keeps Plan/Cookbook/Shop/Pantry only, `grid-cols-6` → `grid-cols-4` — mirroring desktop instead of inventing a mobile-only hierarchy.
2. **Settings moves to a header `IconButton`** (Plan 03), shown at *all* breakpoints — not just `hidden md:flex` — so it's 1 tap from mobile too, replacing both the tab-only mobile path and the desktop-only text link (line 97).
3. **Import becomes a header quick-add**, 1 tap from anywhere, extending desktop's existing "+ Import" pill (lines 90-96) to render on mobile too instead of staying `hidden md:flex`. Cookbook keeps its own "Import recipe"/"+ Add recipe" buttons, so Import stays reachable at ≤1 tap from every screen (header) with full context from Cookbook — nothing regresses versus today's tab. Weigh a single "+" `IconButton` behind a `Menu` ("Add recipe" / "Import recipe", reusing that exact copy) against two separate header icons; the single-icon `Menu` keeps header clutter down.
4. **Active tab gets real weight.** Lucide icons accept `fill` directly (no new dependency): `fill={active ? "currentColor" : "none"}`, plus `font-semibold` on the active label and a `rounded-full bg-terra-soft` pill behind the active icon, sized within the existing `h-14` row.
5. **`black-translucent` status bar.** `statusBarStyle: "default"` → `"black-translucent"` so `layout.tsx`'s cream header runs underneath it; add `padding-top: env(safe-area-inset-top)` to `<header>` so the brand mark/icons clear the clock/battery area. This is the only place `safe-area-inset-top` is needed — screen content doesn't sit under the status bar.
6. **`theme-color` per color scheme.** Next's `Viewport.themeColor` accepts `{ media, color }[]`. Add a light entry (keep `#C2613B`) and a dark entry; Plan 09 owns the real dark palette, so wire the array now with a placeholder dark value and leave the exact color to the owner/Plan 09.
7. **Touch ergonomics.** In `frontend/src/app/globals.css`: `-webkit-tap-highlight-color: transparent` globally, keep the page's native rubber-band bounce (home-screen apps have no pull-to-refresh, and the bounce is part of feeling native), and put `overscroll-behavior: contain` on scrollable `Sheet`/`Menu` panels so scrolling inside them never drags the page behind. 44×44 targets: `MobileTabBar`'s row is already `h-14` (56px); at 4 columns even a 375px phone gives ~86px per tab — only the new header `IconButton`s need checking, and the shared contract already requires 44×44 there.
8. **Splash screens — scoped down.** `apple-touch-startup-image` needs device-specific PNGs; `public/icons/` has none today. Generating that art is out of this plan's PR-sized scope — flagged as a follow-up. In the interim, iOS falls back to `background_color` + the largest manifest icon, which are already correct (`#FAF7F2`, matching the app's real background).

## Implementation steps

1. `MobileTabBar.tsx`: drop `import`/`settings` from `TABS`; `grid-cols-6` → `grid-cols-4`; add `fill`, active label weight, active pill.
2. `layout.tsx`: replace the `hidden md:flex`-gated Settings link and "+ Import" pill with always-visible header actions — a Settings `IconButton` and an Import `IconButton`+`Menu` (Plan 03 primitives), reusing `localHref("settings")`/`localHref("edit")`/`localHref("import")`. Keep the 4 `navLinks` desktop-only (`hidden md:flex`) as today.
3. `layout.tsx`: `statusBarStyle` → `"black-translucent"`; safe-area-top padding on `<header>`; split `viewport.themeColor` into a light/dark array.
4. `globals.css`: add the `-webkit-tap-highlight-color` rule and `--tabbar-height` (tab bar height plus `env(safe-area-inset-bottom)`; `0px` from `md:` up and on cook routes). Size `MobileTabBar` from it so plans 05 and 08 can position sticky actions above it.
5. Manual verification on a real iPhone/iPad per `docs/testing/local-first-pwa-release.md` — status bar treatment and theme-color can't be verified in Chromium PWA tests.

## Tests and verification

- `frontend/src/app/(app)/_components/__tests__/MobileTabBar.test.tsx`: all three tests reference the 6-tab set and must change — test 1's `getByRole("link", {name:"Settings"})` assertion and the `for (const label of [...])` loop (lines 20-27, 36-39) drop `Import`/`Settings`; the cook-route test's `queryByText("Import")` check (line 51) stays valid (now trivially true).
- **No e2e spec drives navigation by clicking a tab.** Every spec under `frontend/e2e/` navigates via `page.goto("/app#/...")` directly (`pwa-planning.spec.ts`, `pwa-offline.spec.ts`, `pwa-import.spec.ts`, `pwa-recipe-copy.spec.ts`); `navigation.spec.ts` only asserts the pricing link is absent. Removing Import/Settings tabs breaks no e2e flow — lower risk than it looks.
- Add e2e coverage (extend `navigation.spec.ts`) asserting a header control reaches Settings, and one reaches Import, in one interaction from a non-target screen on a mobile viewport.
- No unit test covers `layout.tsx`'s header today (server component wrapping client children) — cover the new header actions at the e2e level.
- Full gate per README: `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`; physical iPhone/iPad check for status bar/safe-area/theme-color.

## Risks and open questions

- Moving Import off the tab bar is the biggest behavior change — trading a dedicated tab for a header quick-add plus Cookbook's existing buttons. If the owner wants a guaranteed dedicated tab regardless, the alternative is 5 tabs (drop only Settings), `grid-cols-5`.
- Dark-mode `theme-color` is a placeholder until Plan 09 exists.
- Splash-screen art generation is out of scope; decide whether it's worth a follow-up plan or the manifest fallback is good enough.

## Acceptance criteria

- [ ] Mobile tab bar shows exactly Plan, Cookbook, Shop, Pantry, with a visibly weighted active state (fill + label weight + pill), still hidden on cook routes.
- [ ] Settings and Import each reachable in one tap from every non-cook `/app` screen via the header, mobile and desktop.
- [ ] `#/import`/`#/settings` deep links and legacy redirects still work unchanged.
- [ ] Status bar `black-translucent` with header padded for `safe-area-inset-top`; `theme-color` split light/dark.
- [ ] `-webkit-tap-highlight-color` set globally; page bounce kept; `Sheet`/`Menu` panels contain their own overscroll.
- [ ] `--tabbar-height` defined and used by `MobileTabBar`.
- [ ] `MobileTabBar.test.tsx` updated and passing; e2e navigation coverage added; physical device check scheduled.
