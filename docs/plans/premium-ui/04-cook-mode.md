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

**2. Screen Wake Lock.** New `frontend/src/lib/wake-lock.ts` exporting `useScreenWakeLock(active: boolean): { active: boolean }`. Feature-detect `"wakeLock" in navigator`; request `navigator.wakeLock.request("screen")` when `active` turns true; release on cleanup and whenever `active` goes false; re-acquire on `visibilitychange` when the document becomes visible again and `active` is still true (the OS releases the lock on background — expected, not a bug). Swallow rejection (no user activation, low battery) silently. `CookMode.tsx` passes `active: !done` so the lock auto-releases on the completion screen. Render a "Screen stays on" pill beside the step counter (mobile top strip `:149-151`, desktop top bar `:234-237`) only when the hook reports `active: true`; render nothing when unsupported. Note in-code: iOS Home Screen web apps only get Wake Lock from iOS 18.4+; Safari tabs never do.

**3. Persistent timer pill.** New `frontend/src/components/cook/CookTimerPill.tsx`, replacing the mobile chip (`:191-207`) and consolidating `CookTimer.tsx`'s desktop rendering into one component with one interaction model (tap opens `TimerSheet` on mobile; inline pause/reset on desktop, same props `CookTimer` already takes). Render it in the sticky top strip on both layouts — not just the bottom bar — so it stays visible across scroll position and the `step`/`scroll` toggle, with `tabular-nums` so digits don't jitter.

**4. Typography.** In `CookStepView.tsx:70-84`, bump the active step number to `text-3xl md:text-4xl`, instruction to `text-lg md:text-xl`; apply `tabular-nums` to inline amount chips and the duration/temperature lines (`:93,97`). Increase vertical rhythm now that the header is gone.

**5. Keyboard and swipe.** `useEffect` in `CookMode.tsx` binding `keydown` on `window` (ArrowLeft → `handlePrev`, ArrowRight → `handleNext`), skipped while a sheet is open, `done`, or focus is in an input. Lightweight `onTouchStart`/`onTouchEnd` horizontal-swipe handler (delta threshold, no library) on the step container for mobile, same handlers.

**6. Completion polish.** `CookDoneView.tsx`'s actions move onto plan 03's `Button` (`variant="primary"`/`"secondary"`), with a subtle fade/rise entrance using `--duration-base`/`--ease-out-soft` in place of the current unanimated block.

**7. Optional dark "kitchen" presentation.** Plan 09 lands after 04 (per the README's recommended order), so this stays self-contained: a session-only `IconButton` toggle sets `data-cook-theme="dark"` on the cook root; a small scoped rule set under `[data-cook-theme="dark"]` in `globals.css` (warm near-black background, same terra accent) affects only the cook container. State is local React state — not persisted to `CookProgress` or `localStorage` — so plan 09 can absorb or replace it without a migration.

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
