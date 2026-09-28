# Plan 04 — Cook mode as the showcase

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 01 (sync card out of cook mode), 03 (tokens and primitives)

## Goal

Cook mode is the one screen a cook stares at with wet hands for twenty minutes. Today it's functionally complete but visually identical to every other screen: global chrome, small type, no indication the screen won't sleep, no keyboard/swipe navigation. This plan makes it full-bleed, keeps the screen awake, gives the running timer a permanent home, and polishes the finish (larger serif steps, tabular-nums quantities, a better completion screen, an optional dark "kitchen" presentation).

## Current state (evidence)

- `frontend/src/app/layout.tsx:64-100` renders a global `<header>` (brand + nav) inside every page, including `/app#/cookbook/:id/cook`; `main` (`:103-105`) wraps all children in `max-w-[1400px] px-4 md:px-14 py-16`. Neither is conditional on route.
- `frontend/src/components/app/LocalApp.tsx:51` renders `<SyncStatus sync={sync} />` above every screen; plan 01 removes it from the cook route, so this plan doesn't re-solve that.
- `frontend/src/app/(app)/_components/MobileTabBar.tsx:19,30-33` already hides the bottom tab bar on `/cookbook/:id/cook` via a `COOK_ROUTE` regex against `usePathname()` plus the parsed hash view — the existing, tested precedent for a route-aware client shell component.
- No Screen Wake Lock anywhere (`grep -rn "wakeLock\|WakeLock" frontend/src` is empty).
- `CookMode.tsx` renders two parallel trees: mobile (`:139-219`, `md:hidden`) and desktop (`:222-306`, `hidden md:flex`). jsdom ignores the `hidden` class so both mount in tests, which is why `CookMode.test.tsx` uses `getAllByRole(...)[0]`.
- Timer state (`timer_end_at`, `paused_seconds`) is an absolute epoch value persisted per session in `cook_progress` (`frontend/src/lib/local/repository.ts:197-223`) and re-hydrated from the `progress` prop on every mount (`CookMode.tsx:30-33,59-63`). **It already survives reload, background, and navigation away from cook mode.** What's missing is a visible, ambient indicator: the mobile chip (`:191-207`) and desktop `CookTimer` (`:268-279`) are scoped inside their own layout tree, are separate components with different markup, and vanish the moment you leave the route.
- Step display: `CookStepView.tsx:70-77` renders the step number `font-serif italic text-terra text-2xl`/`text-xl`; inline amounts render via `InlineAmountText` (`:1,84`); the "Start N min timer" chip is `:88-95`. Only `TimerSheet.tsx:83` uses `tabular-nums` today.
- No keyboard/touch navigation: `grep -n "onKeyDown\|ArrowLeft\|onTouchStart" frontend/src/components/cook` only matches the sheets' `trapTabKey` focus traps.
- `docs/design/screens-cook.jsx:46,99` shows a "screen on" pill beside the step counter in the original full-scroll/hands-free concepts — this plan restores that idea for the shipped step-by-step mode; hands-free voice (`Cook3_HandsFree`) stays out of scope.

## Scope and non-goals

In scope: Wake Lock, full-bleed layout, step/quantity typography, a shared running-timer pill, keyboard/swipe navigation, completion screen polish, an optional scoped dark presentation.

Out of scope: voice mode, `CookProgress`/IndexedDB schema changes, unifying the mobile/desktop dual tree (see Risks), changing `LocalScreens.tsx:120-125`'s `CookMode` prop contract (`LocalScreens.boundary.test.tsx:21` mocks it against this exact shape), the app-wide dark mode system (plan 09).

## Design

**1. Full-bleed shell.** Extract `layout.tsx:64-100`'s `<header>` into a client component `frontend/src/app/(app)/_components/AppHeader.tsx`, mirroring `MobileTabBar.tsx`'s pattern exactly: `usePathname()` + a `hashchange`-subscribed hash state, `COOK_ROUTE` test, return `null` on match. `layout.tsx` renders `<AppHeader />` in its place. Give `main` (`:103`) route-aware padding too — cook needs `p-0 max-w-none`, everything else keeps today's — via the same component exporting a small `useIsCookRoute()` hook. This is the only shared-shell change; every other screen's chrome is unchanged after this PR.

**2. Screen Wake Lock.** New `frontend/src/lib/wake-lock.ts` exporting `useScreenWakeLock(active: boolean): { active: boolean }`. Feature-detect `"wakeLock" in navigator`; request `navigator.wakeLock.request("screen")` when `active` turns true; release on cleanup and whenever `active` goes false; re-acquire on `visibilitychange` when the document becomes visible again and `active` is still true (the OS releases the lock on background — expected, not a bug). Swallow rejection (low battery, power-saving mode, no user activation) silently, and retry once on the next tap inside cook mode so a rejected first request still recovers. `CookMode.tsx` passes `active: !done` so the lock auto-releases on the completion screen. Render a "Screen stays on" pill beside the step counter (mobile top strip `:149-151`, desktop top bar `:234-237`) only when the hook reports `active: true`; render nothing when unsupported. Note in-code: Safari tabs support Wake Lock from 16.4, but iOS Home Screen web apps only from iOS 18.4, so older installed iPhones silently get no pill.

**3. Persistent timer pill.** New `frontend/src/components/cook/CookTimerPill.tsx`, replacing the mobile chip (`:191-207`) and consolidating `CookTimer.tsx`'s desktop rendering into one component with one interaction model (tap opens `TimerSheet` on mobile; inline pause/reset on desktop, same props `CookTimer` already takes). Render it in the sticky top strip on both layouts — not just the bottom bar — so it stays visible across scroll position and the `step`/`scroll` toggle, with `tabular-nums` so digits don't jitter.

**4. Typography.** In `CookStepView.tsx:70-84`, bump the active step number to `text-3xl md:text-4xl`, instruction to `text-lg md:text-xl`; apply `tabular-nums` to inline amount chips and the duration/temperature lines (`:93,97`). Increase vertical rhythm now that the header is gone.

**5. Keyboard and swipe.** `useEffect` in `CookMode.tsx` binding `keydown` on `window` (ArrowLeft → `handlePrev`, ArrowRight → `handleNext`), skipped while a sheet is open, `done`, or focus is in an input. Lightweight `onTouchStart`/`onTouchEnd` horizontal-swipe handler (delta threshold, no library) on the step container for mobile, same handlers.

**6. Completion polish.** `CookDoneView.tsx`'s actions move onto plan 03's `Button` (`variant="primary"`/`"secondary"`), with a subtle fade/rise entrance using `--duration-base`/`--ease-out-soft` in place of the current unanimated block.

**7. Optional dark "kitchen" presentation.** Plan 09 lands after 04 (per the README's recommended order), so this stays self-contained: a session-only `IconButton` toggle sets `data-cook-theme="dark"` on the cook root; a small scoped rule set under `[data-cook-theme="dark"]` in `globals.css` overrides the plan 03 `--color-*` custom properties on the cook container only (warm near-black background, same terra accent). Because it uses the same variables as plan 09, 09 can later point this block at its dark values instead of duplicating them. State is local React state — not persisted to `CookProgress` or `localStorage` — so plan 09 can absorb or replace it without a migration.

## Implementation steps (PR-sized, ordered)

1. `AppHeader` extraction + route-aware `main` padding, plus a test mirroring `MobileTabBar.test.tsx`'s three cases.
2. `wake-lock.ts` hook + unit test (mock `navigator.wakeLock`) + wire into `CookMode.tsx` with the pill on both layouts.
3. `CookTimerPill.tsx` (absorbs mobile chip + desktop `CookTimer` usage) + co-located test; wire into both top strips.
4. Typography pass in `CookStepView.tsx` — no prop/behavior change, safe standalone PR.
5. Keyboard + swipe navigation in `CookMode.tsx` + tests (`fireEvent.keyDown(window, { key: "ArrowRight" })`, simulated touch events).
6. `CookDoneView.tsx` polish onto plan 03 `Button` (after plan 03 merges).
7. Dark "kitchen" toggle: CSS rule set + `IconButton` + local state; no schema change.

## Tests and verification

- `frontend/src/components/cook/__tests__/CookMode.test.tsx` — all three existing tests must keep passing unmodified; they assert on button names ("Next", "Scroll", "Step", "Pause timer", "Start 1 min timer"), none of which this plan renames. Add wake-lock lifecycle, arrow-key, and swipe tests.
- `frontend/src/components/app/__tests__/LocalScreens.boundary.test.tsx:21,76-78` mocks `CookMode` directly — unaffected as long as the prop contract holds (it does).
- New `AppHeader.test.tsx` modeled on `MobileTabBar.test.tsx` (renders on `/app`, hides on `/cookbook/:id/cook`).
- `frontend/e2e/pwa-offline.spec.ts:113-115,171-172,178-183,189-192` — cook-route redirect and `getByText("Simmer carrots.").last()` assertions must keep passing; `.last()` depends on the dual tree still both mounting (preserved, see Risks).
- No dedicated cook e2e spec exists. Optional follow-up: `frontend/e2e/cook-mode.spec.ts` for wake-lock request and keyboard nav in real Chromium, via `playwright.pwa.config.ts`.
- `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` per the shared contract's CI gates.

## Risks and open questions

- **Dual mobile/desktop tree kept as-is** rather than unified into one responsive tree, to avoid touching `CookMode.test.tsx` and `pwa-offline.spec.ts`'s `.last()` selector in the same PR set as the visual rework. A later cleanup plan could consolidate once those tests are updated deliberately.
- Wake Lock has no guaranteed Playwright/jsdom support — request it defensively so an unsupported environment reports `active: false` rather than throwing; confirm behavior in a real `pnpm test:pwa` Chromium run, not just unit mocks.
- Physical iOS Home Screen verification (Wake Lock only from 18.4+, only when installed) remains a release-gate item per `docs/testing/local-first-pwa-release.md`, not something CI proves.

## Acceptance criteria

- [ ] `/cookbook/:id/cook` renders with no global header/nav and no sync card, full-bleed on mobile and desktop.
- [ ] Wake Lock requested on entry, released on exit/completion, re-acquired after backgrounding, never throws when unsupported.
- [ ] "Screen stays on" pill visible only when the lock is actually held.
- [ ] One running-timer pill visible in both layouts and both step/scroll modes whenever a timer is active, using `tabular-nums`.
- [ ] Arrow keys and swipe change steps; no-ops while a sheet is open or on the completion screen.
- [ ] `CookDoneView` uses plan 03 primitives and a subtle entrance transition.
- [ ] Optional dark "kitchen" toggle exists, session-scoped, doesn't touch `CookProgress`/IndexedDB.
- [ ] All tests above pass; no visible copy/role changes beyond what's listed.

## Implementation notes

Session scope: every step of this plan except step 1 (the `AppHeader` extraction, hiding the header on cook routes, and route-aware `main` padding), which plan 07 owns. Plan 10's items inside `components/cook/**` are included. Branch `claude/premium-ui-04-cook-mode`.

### Shipped

- `3c7bfd0` **Wake Lock hook.** New `lib/wake-lock.ts` exports `useScreenWakeLock(active): { active, retry }`.
  - It feature-detects `navigator.wakeLock`, requests `"screen"` while `active`, and releases on deactivate or unmount.
  - It tracks the sentinel's `release` event and re-requests on `visibilitychange` to visible.
  - Rejections are swallowed. A generation counter releases a sentinel that resolves after deactivation.
  - `retry()` is stable and re-requests once after a failed automatic request. A failed retry does not re-arm it, so repeated taps can't loop.
  - The doc comment records the Safari 16.4 / iOS 18.4 Home Screen split. 7 tests in `lib/__tests__/wake-lock.test.ts`.
- `2344e61` **Sheets on `Sheet`.** `TimerSheet` and `IngredientsSheet` now render inside `Sheet`, with an `IconButton` close as `initialFocusRef`. Their own focus capture/restore, body scroll lock, Escape listener, backdrop and `trapTabKey` code is deleted.
  - `TimerSheet` changed from full screen to a bottom sheet (a centered panel from `md:`). Its Pause/Resume and Reset are `Button size="lg"`.
  - Quantity chips gain `tabular-nums` and `rounded-control`.
  - Props, exports, dialog names and button names are unchanged.
- `357a192` **`CookTimerPill`.** One component with `variant="mobile" | "desktop"` replaces the mobile bottom-bar timer chip and `CookTimer.tsx` (deleted in `25a5661`).
  - Mobile is one 44px button named "Open timer" that opens `TimerSheet`. Desktop is a `role="group"` pill plus ghost `IconButton`s "Pause timer"/"Resume timer" and "Reset timer".
  - It uses the lucide `Timer` icon and `tabular-nums`. It has no interval of its own: `CookMode` already ticks. 6 tests.
- `3626a94` **Typography, glyphs and CTAs.**
  - `CookStepView`: the active step number is `text-3xl md:text-4xl` and the instruction `text-lg md:text-xl`, with more padding and gap, `shadow-raised`, `rounded-card` and `aria-current="step"`.
  - `tabular-nums` is set on the instruction paragraph, which covers the inline amount chips by inheritance without touching plan 05's `InlineAmountText`. It is also on the step number, timer chip and temperature line.
  - The timer chip is now 44px tall. The desktop Back/Next buttons are `Button size="lg"`.
  - `CookScrollView`: larger step text, and duration/temperature on one tabular row.
  - Glyph swaps: ⏲/⏱ → lucide `Timer`, 🌡 → `Thermometer`, ✓ → `Check`. The →/‹/← arrows stay typographic inside `aria-hidden` spans.
  - `CookIngredientPanel` gets tabular chips, `rounded-card`, and a sidebar `top-20` so it clears the sticky top bar.
  - `CookDoneView`: `Button size="lg"` primary "Mark as cooked" (`loading`) and secondary "Back to recipe" (`href`), a step-count eyebrow, a larger heading, and the `cook-rise` entrance (`--duration-base`/`--ease-out-soft`, off under `prefers-reduced-motion`). The error is now `role="alert"`.
  - `MarkOutOfStep`'s 56px CTAs move to `Button size="lg"` with the same entrance.
- `25a5661` **`CookMode` wiring.**
  - **Screen-on pill:** "Screen stays on" (lucide `MonitorCheck`, forest tint) shows beside the step counter in both top strips only while the hook reports a held lock. The hook gets `!done`, so the completion screen releases it. `onPointerDown={wakeLock.retry}` on the cook root is the retry-on-next-tap.
  - **Timer pill:** `CookTimerPill` sits in both sticky top strips. The desktop top bar is now sticky too.
  - **Mobile bottom bar:** Prev and Next only, as `Button size="lg"`.
  - **Arrow keys:** a `keydown` listener on `window`, skipped while a sheet is open, on the completion screen, in scroll layout, with modifier keys, or when focus is in an input.
  - **Swipe:** handlers on the mobile step container need at least 60px of horizontal travel that is 1.5× the vertical travel.
  - **Kitchen toggle:** an `IconButton` "Dark kitchen mode" (`aria-pressed`, Moon/Sun) in both top strips. It sets `data-cook-theme="dark"` on the cook root and mirrors it onto `<body>` while on. The state is local React state only, so nothing is written to `CookProgress`, IndexedDB or `localStorage`.
  - **CSS:** a delimited `/* ── Cook mode (plan 04) ── */ … /* ── End cook mode (plan 04) ── */` block at the end of `globals.css` redefines the plan 03 `--color-*`/`--shadow-*` tokens under `[data-cook-theme="dark"]` (warm near-black, same terra). It darkens the shared overlay backdrop there and defines the `cook-rise` keyframes.
  - **Tests:** new `CookMode.interactions.test.tsx` (7 tests) covers arrow keys, what the keys skip, horizontal and vertical swipes, the wake-lock pill lifecycle and release on completion, retry on the next tap, the kitchen toggle (root and body attributes, cleanup, no save), and the timer pill in both layouts.
- `29435f3` The screen-on pill drops its label to an icon (the label stays `sr-only`) below 390px, so the mobile top strip fits at 360px.

### Deviations

- **Step 1 not done here.** Plan 07 owns it. Until it merges, cook mode still renders under the global header and inside `main`'s `max-w-[1400px] px-4 py-16` padding, so it is not full-bleed yet. The desktop wrapper keeps `min-h-[calc(100dvh-80px)]`.
- **Kitchen theme mirrored to `<body>`.** `Sheet` portals to `document.body`, so an attribute on the cook root alone would leave the timer and ingredient sheets light. `CookMode` sets `body[data-cook-theme]` in an effect while the toggle is on and removes it on toggle-off or unmount. Until plan 07 lands, this also darkens the global header on the cook route.
- **Terra unchanged in the kitchen theme.** White-on-terra stays at today's contrast. Only surfaces, ink, lines, forest/warn/danger and focus change.
- **Gestures never finish the recipe.** ArrowRight and a left swipe stop at the last step rather than calling `handleNext` into the completion screen. Accidentally finishing loses the step view for the session, so only the Next/Finish button finishes. Arrow keys are also off in scroll layout, where they scroll the page natively.
- **Mobile timer button removed from the bottom bar.** The bottom bar's disabled "Timer (not set)" placeholder is gone. When no timer is set there is nothing to show, and a running timer now lives in the top strip.
- **Button names.** "Next →", "Finish →", "← Prev" and "‹ Back" now have `aria-hidden` arrows, so their accessible names are "Next", "Finish", "Prev" and "Back". Existing tests use `/Next/` regexes and still pass. No test asserted the old full strings.
- **Test changes.** The three `CookMode.test.tsx` tests are unmodified. `IngredientsSheet.test.tsx`'s backdrop test changed its selector from `[aria-hidden="true"]` to `[data-overlay-backdrop]`, because `Sheet`'s drag handle is also `aria-hidden`. Its assertion is unchanged. Each sheet test file gained a focus-on-open test.
- **No `cook-mode.spec.ts` e2e.** It was optional in the plan. Wake Lock was instead checked in real headless Chromium during screenshots: it is denied by default (`NotAllowedError`, so no pill, no throw) and held once the `screen-wake-lock` permission is granted over CDP (pill shows).

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`, on `29435f3`:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 54 files, 443 tests pass (baseline 421; 22 new: wake-lock 7, CookTimerPill 6, CookMode interactions 7, sheet focus 2).
- `pnpm build`: pass (with CI's public env).
- `pnpm test:pwa`: 7/7 pass, using the `IMPLEMENTING.md` shim for Chromium 1223.
- **Screenshots:** taken against the production build at 393×852, 1280×860 and 360×780. They cover step layout, desktop scroll layout, a running timer pill, the timer and ingredient sheets, the kitchen dark theme (step, scroll and timer sheet), the dark completion screen, and the "Screen stays on" pill with the permission granted.

### Handoffs

- **Plan 07:** step 1 of this plan. Hide the header on `/cookbook/:id/cook`. Give `main` `p-0 max-w-none` there. Hide the "Offline ready" pill on cook routes: it currently overlaps the mobile bottom action bar area on the cook screen. Once `main` padding is gone, cook mode's mobile tree already carries `pt-[env(safe-area-inset-top)]` on its sticky top strip, and the desktop wrapper's `min-h-[calc(100dvh-80px)]` can become `min-h-dvh`.
- **Plan 09:** the cook block in `globals.css` redefines the same tokens as your `[data-theme="dark"]` block. Point it at your values, or replace the toggle with the app theme, and delete the `body[data-cook-theme]` mirroring in `CookMode.tsx` if your theme lives on `<html>`. The shared overlay backdrop is `bg-ink/40`, which goes light when `ink` is cream. The cook block overrides it locally, but app-wide dark mode needs the same fix in `Overlay.tsx`.
- **Plan 06:** `cook-rise` is a small local entrance in the cook block. Fold it into the motion system if you add a shared one.

### Needs a device

- Wake Lock on an installed iPhone/iPad on iOS 18.4+: the pill appears, the lock re-acquires after backgrounding and returning, and the screen actually stays on. Also that older iOS shows no pill and no error, and that retry on the next tap recovers after a first request is rejected in Low Power Mode.
- Swipe navigation against iOS Safari's edge-swipe back gesture, and vertical scrolling inside a long step.
- Safe-area top padding on the mobile top strip with the `black-translucent` status bar (after plan 07).
- The kitchen dark theme's legibility in a real kitchen, and `color-scheme: dark` on native controls inside the cook sheets.
