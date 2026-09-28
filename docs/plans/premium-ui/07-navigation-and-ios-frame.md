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

## Implementation notes

Branch `claude/premium-ui-07-navigation`, cut from `ba270d8`. This covers plan 07 and step 1 of plan 04 (the header extraction).

### Shipped

- `327b1eb` **Tokens and touch rules** (`globals.css`, `lib/theme.ts`):
  - `--tabbar-row` is `3.5rem`. `--tabbar-height` defaults to `0px`. It becomes `calc(var(--tabbar-row) + env(safe-area-inset-bottom))` only while an element with `[data-mobile-tabbar]` is on the page (`:root:has(...)`), and goes back to `0px` from `md:` (48rem) up. So it is `0px` on cook routes and on non-`/app` pages with no JavaScript. Plans 05 and 08 can use `bottom: calc(var(--tabbar-height) + 0.75rem)` as the contract says.
  - `-webkit-tap-highlight-color: transparent` is set on `:root` (the property is inherited).
  - The page keeps its native bounce. Overlay panels (`[data-overlay-backdrop] > [aria-modal]`, which covers `Sheet` and `Dialog`) and `[role="menu"]` get `overscroll-behavior: contain`. These are selector rules in `globals.css`, so `components/ui/**` was not touched.
  - `theme.ts` adds `THEME_COLOR_DARK_HEX = "#1B1815"`, a placeholder equal to today's ink. Plan 09 finalizes it.
- `c6d75d9` **`AppHeader.tsx`** (new, in `app/(app)/_components/`) and `layout.tsx`:
  - Shared hooks `useLocationHash()` and `useIsCookRoute()`. Cook means the legacy `/cookbook/:id/cook` path or `/app#/cookbook/:id/cook`.
  - `AppHeader`: brand mark, then the `#app-header-status` slot (`flex min-w-0 md:-ml-5`, because the nav is now `gap-3 md:gap-8`), a spacer, and the desktop section links (`hidden md:flex`, now with `aria-current="page"` and `text-ink` when active; recipe and edit count as Cookbook).
  - At every breakpoint the header also shows a `Menu` labelled "Add or import a recipe" with a `+` trigger and the items "Add recipe" (`localHref("edit")`) and "Import recipe" (`localHref("import")`). Next to it is a Settings icon link (`<a aria-label="Settings">` using IconButton's ghost classes, 44×44).
  - The old "+ Import" pill and the "Settings" text link are removed.
  - The header is `bg-bg pt-[env(safe-area-inset-top)]` with a `py-2 md:py-3` row, about 60px, the same as before. It is **hidden, not unmounted**, on cook routes (`<header hidden>`), so `#app-header-status` stays the same DOM node that `LocalApp` portals into.
  - `AppMain` is route-aware.
    - Cook routes: `w-full max-w-none p-0 pt-[env(safe-area-inset-top)]`.
    - Other routes: today's classes, with the bottom padding changed to `pb-[calc(var(--tabbar-height)+1.5rem)] md:pb-24`.
  - `layout.tsx` now:
    - renders `<AppHeader />` and `<AppMain>`;
    - adds a fixed status-bar scrim (`h-[env(safe-area-inset-top)] bg-bg/85 backdrop-blur`, 0px tall in browsers);
    - sets `statusBarStyle: "black-translucent"`;
    - sets `themeColor` to `[{ light: TERRA_HEX }, { dark: THEME_COLOR_DARK_HEX }]` via `media` queries.
  - Tests: new `AppHeader.test.tsx` (6 tests), and new `e2e/pwa-navigation.spec.ts` at 393×852 (the tab bar has exactly 4 links; the header Settings link reaches `#/settings` in one tap; the `+` menu reaches `#/import`).
- `2a61803` **`MobileTabBar.tsx`**:
  - Four tabs (Plan, Cookbook, Shop, Pantry) in `grid-cols-4`, using the shared hooks.
  - `data-mobile-tabbar` and `h-(--tabbar-height)`, with links set to `h-full`.
  - Active state: a `rounded-full bg-terra-soft` pill (`h-8 w-14`) behind the icon, a `font-semibold` label, and the icon drawn with `fill="currentColor" fillOpacity={0.25} strokeWidth={2.25}`.
  - `MobileTabBar.test.tsx` is updated: exactly 4 links, no Import or Settings, `data-mobile-tabbar`, nothing on non-`/app` pathnames, and the cook route renders empty.
- `aed7f1b` **`ServiceWorkerRegister.tsx`**:
  - The floating panel sits at `bottom: calc(max(var(--tabbar-height), env(safe-area-inset-bottom)) + 1rem)`, replacing `bottom-20 md:bottom-4`. At `md:` this equals `bottom-4`.
  - On cook routes the passive "Offline ready" note is hidden, and the component renders nothing if that is all it would show. Update, install and error UI still appear.
  - New `ServiceWorkerRegister.cook.test.tsx`.

### Deviations

- **The header hides instead of returning `null`** (plan 04 §1 said `return null`). Unmounting would replace the `#app-header-status` node, and `LocalApp` reads the slot with a never-subscribing `useSyncExternalStore`, so it could hold a detached node after leaving cook mode.
- **Import takes two taps** (open the `+` menu, then choose). That follows the brief's single-`Menu` choice. The acceptance box's "one tap" is met for Settings only; Import stays one tap from Cookbook's own buttons.
- **Settings is an `<a>` styled like `IconButton`**, not an `IconButton`. It navigates, so a real link keeps middle-click, the link role and `aria-current`. The e2e test finds it by `getByRole("link", { name: "Settings" })`.
- **Menu items navigate with `window.location.assign(localHref(...))`**, because `Menu` items are buttons with `onSelect`, not links.
- **Active icon fill.** A solid `currentColor` fill blots out the interior strokes of CalendarDays (the dots), ShoppingBasket (the slats) and Package (the seams). A 25% `currentColor` tint keeps them visible and still reads as filled, and it follows theme changes.
- **Status-bar scrim.** The plan says only the header needs `safe-area-inset-top`. But with `black-translucent`, content scrolls under the transparent status bar once the (non-sticky) header scrolls away. The fixed scrim in `layout.tsx` covers that, and it is also present on cook routes.
- **Cook `main` also gets `pt-[env(safe-area-inset-top)]`** (0 in browsers), because the header that used to clear the status bar is hidden there.
- **Bug fix in `ServiceWorkerRegister`.** The render guard now also counts `updateApplied`. Without it, applying an update while cooking left nothing visible: the ready note was hidden and `waiting` had cleared, so "Update installed. Reload when you are ready." never rendered. `pwa-offline.spec.ts`'s cook-mode update test caught this.
- **Manifest unchanged.** `theme_color` in `manifest.webmanifest` can't vary by color scheme, and `background_color` is already right. No splash artwork, per the owner's decision.

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 53 files and 430 tests pass (baseline 421).
- `pnpm build`: pass, with CI's public env. The generated CSS contains `.h-\(--tabbar-height\){height:var(--tabbar-height)}` and the pill's `bottom:calc(max(...)+1rem)`.
- `pnpm test:pwa`: 10/10 pass (7 existing and 3 new in `pwa-navigation.spec.ts`), using the 1194→1223 headless-shell shim from IMPLEMENTING.md. The first run failed `pwa-offline` "failed update keeps the old release…"; that was the `updateApplied` bug above, fixed in `aed7f1b`.
- **Screenshots** at 393×852 and 1280×860 of plan, cookbook, shop, pantry, settings, import, recipe detail, cook mode and the open `+` menu, against the production build with a restored one-recipe library.
  - The header fits on a phone with the "Sign in to sync" chip, `+` and Settings.
  - The 4-tab bar shows the active pill.
  - The menu anchors under `+` at both sizes.
  - On cook, the header, tab bar and offline pill are all hidden.

### Handoffs

- **Plan 04 (cook):**
  - `main` is now `p-0 max-w-none` on cook routes. The desktop cook tree (`CookMode.tsx:222`) has no padding of its own and sits flush to the viewport edges, so give it its own gutter (for example `px-6 md:px-14 py-6`).
  - The mobile top strip (`sticky top-0`, `:141`) should use `top: env(safe-area-inset-top)` or its own safe-area padding. Otherwise, on an installed iPhone it sticks under the status-bar scrim once scrolled.
  - `min-h-[calc(100dvh-80px)]` (`:222`) assumed the header, which is now gone.
- **Plans 05 and 08:** position sticky actions with `bottom: calc(var(--tabbar-height) + 0.75rem)`. The "Offline ready" pill sits at `var(--tabbar-height) + 1rem` on the right and can overlap a full-width sticky button: "Review shopping →" at the bottom of Plan overlaps it today in the phone screenshot. Either reserve right-side room or raise one of them. The pill's own placement is plan 07's file if the coordinator prefers to move it (for example, auto-dismissing "Offline ready" after a few seconds).
- **Plan 09:** replace `THEME_COLOR_DARK_HEX` in `lib/theme.ts`. Also give the status-bar scrim (`bg-bg/85`) and header `bg-bg` the dark tokens (they already use `--color-bg`).
- **Plan 06:** the header `Menu` popover and the tab-bar pill are candidates for `@starting-style` and press feedback.

### Needs a device

- `black-translucent` status bar on an installed iPhone: the cream header under the clock, safe-area-top padding clearing the notch or Dynamic Island, and the scrim keeping scrolled content legible behind the status bar, in portrait and after rotation.
- `theme-color` light/dark behavior. iOS standalone with `black-translucent` may ignore `theme-color`, while Safari tabs use it.
- Tab bar height with the home indicator (`env(safe-area-inset-bottom)` in `--tabbar-height`), and sticky footers from plans 05 and 08 sitting above it.
- `:root:has([data-mobile-tabbar])` (Safari 15.4+) switching `--tabbar-height` when entering and leaving cook mode.
- The tap highlight gone on iOS Safari, rubber-band bounce kept on the page, and `overscroll-behavior: contain` inside Sheet and Menu panels (iOS 16+).
- Header touch targets in real use: the 44×44 `+` and Settings next to the roughly 30px sync chip, and the brand mark on a 375px phone with a long chip label.
- The cook route on iPad in standalone mode: no header, content clearing the status bar.
