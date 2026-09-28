# Plan 06 — Motion system

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** 03 (tokens and primitives)

## Goal

Give `/app` one coherent motion language — page-to-page transitions, overlay entry/exit, press feedback — built on platform primitives (`document.startViewTransition`, CSS `@starting-style`, CSS transitions), with a real `prefers-reduced-motion` policy. No animation library, per the shared contract's zero-new-dependencies constraint.

## Current state (evidence)

- `grep -rn "startViewTransition\|@keyframes\|prefers-reduced-motion" frontend/src` is empty: no view-transition usage, no keyframes, no reduced-motion handling anywhere.
- `grep -rln "transition-colors" frontend/src` matches 28 files — scattered, ad hoc, each on Tailwind's default duration with no shared easing.
- Exactly two `animate-pulse` usages: `frontend/src/components/recipe/ParsingProgress.tsx:119` (status dot) and `frontend/src/app/(app)/import/ImportFlow.tsx:61` (hourglass emoji) — untouched by this plan; both become reduced-motion-safe once the global policy lands (§5).
- `active:scale-[0.98]` press feedback exists **only** in cook mode: `frontend/src/components/cook/CookMode.tsx:186,197,213` and `frontend/src/components/cook/TimerSheet.tsx:98,112`. No other button/card has press feedback.
- Navigation is entirely hash-based, un-intercepted: every internal link is a plain `<a href="/app#/...">` (`MobileTabBar.tsx:46-55`, `LocalScreens.tsx:82-89`, `layout.tsx:68-97`). `LocalApp.tsx:31-40` is the single `hashchange` listener that calls `parseLocalRoute` → `setRoute`. `grep -n "navigate\|router\." frontend/src/components/app` is empty — no programmatic navigation exists yet. This is the seam a `navigate()` wrapper sits in front of.
- The cookbook card title (`LocalScreens.tsx:87-89`, `<a href={localHref("recipe", item.id)}>` wrapping `<p className="font-serif text-xl text-ink">{item.title}</p>`) and the recipe detail `<h1>` (`RecipeDetail.tsx:105-108`) are the two elements for a card → title morph.
- Sheets mount/unmount via `if (!open) return null` with no entry transition (`IngredientsSheet.tsx:66`, `TimerSheet.tsx:53`); plan 03's shared `Sheet`/`Dialog` own the real implementation, but this plan supplies their `@starting-style` treatment.
- No animation dependency exists to remove or guard against: `grep -n "framer-motion\|motion/react\|gsap" frontend/package.json` is empty.

## Scope and non-goals

In scope: a `navigate()` wrapper, view-transition-name wiring for the cookbook → recipe morph, direction-aware transitions for tab vs. push navigation, `@starting-style` entry for `Sheet`/`Dialog`, press feedback on `Button`/`Card`, subtle list stagger, one source of truth for motion tokens, and the reduced-motion policy (CSS + JS).

Out of scope: animating the sync card (removed by plan 01), cook mode's own step/timer animation (plan 04, reusing these tokens), the dark-mode transition (plan 09), cross-document view transitions (all navigation here is client-side hash routing inside one document).

## Design

**1. Motion tokens, one source.** Plan 03 defines `--ease-out-soft`, `--ease-spring`, `--duration-fast` (~120ms), `--duration-base` (~220ms), `--duration-slow` (~360ms) as CSS custom properties in `globals.css`. This plan is the first JS consumer (to time a `flushSync` window and pass durations into `::view-transition-*` rules) — add `frontend/src/lib/motion-tokens.ts` mirroring the numeric values in ms, with a comment that CSS stays the source of truth so the two don't drift.

**2. The `navigate()` wrapper.** New `frontend/src/lib/local/navigate.ts`: `navigate(href, opts?: { direction?: "push" | "pop" | "tab" })`. If `document.startViewTransition` is unsupported, or `prefers-reduced-motion: reduce` is set, it falls back to today's exact behavior — `window.location.hash = href.split("#")[1]` — so there's no visible regression on any unsupported platform. Otherwise: `document.startViewTransition(() => flushSync(() => { window.location.hash = ...; }))`, wrapping the hash write in React 19's `flushSync` so the "after" snapshot the browser captures reflects the new route (the existing `hashchange` listener in `LocalApp.tsx:31-32` still drives `setRoute`, but `flushSync` forces that update to happen synchronously inside the transition callback). Set `document.documentElement.dataset.navDirection` immediately before starting, so CSS can select on it; clear it on `transition.finished`.
Add `frontend/src/components/app/LocalLink.tsx`: wraps a plain `<a>`, intercepts unmodified left-clicks, calls `navigate(href, { direction })`, otherwise renders identically (modified clicks/middle-click pass through untouched). Each call site opts in individually — `MobileTabBar.tsx`'s tabs pass `direction="tab"`; the cookbook card and `RecipeDetail`'s Edit/Cook actions pass `"push"`; browser back is `"pop"`, handled by a `popstate` listener inside `navigate.ts` itself.

**3. Card → title morph.** Give the cookbook card title (`LocalScreens.tsx:88`) and the recipe detail `<h1>` (`RecipeDetail.tsx:105`) a shared, per-recipe `view-transition-name` (`recipe-title-${item.id}`), set on the source element by `LocalLink`'s click handler; the destination picks up the same name naturally since both derive it from `recipe.id`. Scoped to exactly this one pair for now — a generic multi-element convention is a later plan's call if it proves useful. `::view-transition-group(recipe-title-*)` uses `--duration-base`/`--ease-out-soft`.

**4. Direction-aware transitions.** Default: cross-fade at `--duration-fast`. Under `[data-nav-direction="push"]`: old view fades/slides left-under, new view slides in from the right. `"pop"` reverses it. `"tab"`: cross-fade only (tabs are lateral, not hierarchical). All defined once in `globals.css` under `@media not (prefers-reduced-motion: reduce)`, using `::view-transition-old(root)`/`::view-transition-new(root)`.

**5. Reduced motion.** CSS: one global rule — `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }` — this also neutralizes both existing `animate-pulse` usages and all 28 `transition-colors` call sites without touching any of them individually. JS: `navigate.ts` checks `matchMedia("(prefers-reduced-motion: reduce)").matches` before ever calling `startViewTransition` (a reduced-motion transition still snapshots/paints, which is wasted work and can still read as motion) and falls back to the plain hash write.

**6. `@starting-style` for `Sheet`/`Dialog`.** Once plan 03 lands the shared components, open/close should animate via `@starting-style` (`opacity`, `translateY` for the bottom-sheet case) instead of the current abrupt mount. This plan supplies the CSS pattern; the `Sheet.tsx`/`Dialog.tsx` edit itself happens in plan 03's PR (or a fast-follow here if 03 has already shipped) so the styling doesn't fork across two plans touching the same file.

**7. Press feedback on primitives.** `Button`/`Card` (plan 03) get `active:scale-[0.98] transition-transform` by default, matching the cook mode precedent exactly. Migrating cook mode's raw buttons and `TimerSheet.tsx:98,112` onto the new primitives is plan 04's job, not duplicated here.

**8. List stagger.** For the cookbook grid (`LocalScreens.tsx:86-89`) and similar lists: CSS-only stagger via `animation-delay: calc(var(--stagger-index) * 30ms)` set as a per-item inline custom property, capped around 6 items so a long list doesn't feel sluggish. Opacity/`translateY(4px)` only, `--duration-fast`, skipped under reduced motion by the same global rule.

## Implementation steps (PR-sized, ordered)

1. Motion tokens JS mirror + reduced-motion global CSS rule (`globals.css`) — no visible change, lands first.
2. `navigate.ts` with full fallback logic + unit tests (jsdom has no `startViewTransition`, so the fallback path is what CI exercises; assert `flushSync` updates route state correctly).
3. `LocalLink.tsx` + swap `MobileTabBar.tsx`'s tab links and `layout.tsx`'s nav links onto it (`direction="tab"`).
4. Swap the cookbook card and recipe detail Edit/Cook/Back links onto `LocalLink` with `direction="push"`; add `popstate` → `"pop"`.
5. `view-transition-name` wiring for the card↔title pair + direction-aware `::view-transition-*` CSS.
6. List stagger on the cookbook grid.
7. `@starting-style` pattern for `Sheet`/`Dialog` (coordinate timing with plan 03).
8. Press-feedback default on `Button`/`Card`, checked against cook mode's existing feel ahead of plan 04.

## Tests and verification

- New `navigate.test.ts`: no-`startViewTransition` fallback (default jsdom case), reduced-motion fallback (mock `matchMedia`), and a mocked supported path confirming synchronous `flushSync` semantics.
- New `LocalLink.test.tsx`: click interception, modified-click passthrough, `direction` reaching `navigate`.
- `MobileTabBar.test.tsx` must keep passing unmodified — it asserts `href` and `aria-current`, neither of which changes (`LocalLink` only adds an `onClick`, the anchors keep real `href`s).
- `frontend/e2e/navigation.spec.ts` and `pwa-*.spec.ts` must keep passing — `page.goto()` doesn't go through `LocalLink`'s click handler, so these exercise the fallback path and stay representative.
- **Playwright stability:** set `reducedMotion: "reduce"` in `frontend/playwright.pwa.config.ts`'s `use` block (Playwright's built-in option, no new dependency) so PWA e2e never races a view transition; run one manual pass with `reducedMotion: "no-preference"` before merging step 5 to confirm the animation itself isn't masking a bug.
- `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` per the shared contract.

## Risks and open questions

- `startViewTransition` support is Chromium + Safari 18+ only (per the contract's verified facts); Firefox permanently uses the fallback path — acceptable for a personal PWA, worth the owner confirming.
- `flushSync` inside the transition callback needs `setRoute` to run synchronously; if `hashchange` doesn't fire synchronously enough in practice, `navigate.ts` may need a small direct event-bus call instead of relying purely on `hashchange` — a larger change than currently scoped. Step 2's unit tests should surface this early.

## Acceptance criteria

- [ ] `navigate()` falls back to today's exact behavior when unsupported or reduced-motion is set; no visible regression anywhere.
- [ ] Cookbook card → recipe title share a `view-transition-name` and animate as one element across the navigation.
- [ ] Tab navigation cross-fades; push/pop slides directionally.
- [ ] `prefers-reduced-motion: reduce` removes all animation/transition duration app-wide via one global rule.
- [ ] `Button`/`Card` press feedback matches cook mode's existing `active:scale-[0.98]` feel.
- [ ] Playwright PWA suite runs with `reducedMotion: "reduce"` and isn't flaky across 3 consecutive local runs.
- [ ] No new npm dependency added.
