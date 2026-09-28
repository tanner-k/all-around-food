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
- Navigation is entirely hash-based, un-intercepted: every internal link is a plain `<a href="/app#/...">` (`MobileTabBar.tsx:46-55`, `LocalScreens.tsx:82-89`, `layout.tsx:68-97`). `LocalApp.tsx:31-40` is the single `hashchange` listener that calls `parseLocalRoute` → `setRoute`. `grep -n "navigate\|router\." frontend/src/components/app` is empty — no programmatic navigation exists yet. That listener is where route transitions hook in.
- The cookbook card title (`LocalScreens.tsx:87-89`, `<a href={localHref("recipe", item.id)}>` wrapping `<p className="font-serif text-xl text-ink">{item.title}</p>`) and the recipe detail `<h1>` (`RecipeDetail.tsx:105-108`) are the two elements for a card → title morph.
- Sheets mount/unmount via `if (!open) return null` with no entry transition (`IngredientsSheet.tsx:66`, `TimerSheet.tsx:53`); plan 03's shared `Sheet`/`Dialog` own the real implementation, but this plan supplies their `@starting-style` treatment.
- No animation dependency exists to remove or guard against: `grep -n "framer-motion\|motion/react\|gsap" frontend/package.json` is empty.

## Scope and non-goals

In scope: view transitions driven from the existing `hashchange` listener, view-transition-name wiring for the cookbook → recipe morph, direction-aware transitions for tab vs. push navigation, `@starting-style` entry for `Sheet`/`Dialog`, press feedback on `Button`/`Card`, subtle list stagger, one source of truth for motion tokens, and the reduced-motion policy (CSS + JS).

Out of scope: animating the sync card (removed by plan 01), cook mode's own step/timer animation (plan 04, reusing these tokens), the dark-mode transition (plan 09), cross-document view transitions (all navigation here is client-side hash routing inside one document).

## Design

**1. Motion tokens, one source.** Plan 03 defines `--ease-out-soft`, `--ease-spring`, `--duration-fast` (~120ms), `--duration-base` (~220ms), `--duration-slow` (~360ms) as CSS custom properties in `globals.css`. This plan is the first JS consumer (to pass durations into `::view-transition-*` rules) — add `frontend/src/lib/motion-tokens.ts` mirroring the numeric values in ms, with a comment that CSS stays the source of truth so the two don't drift.

**2. Transition inside the existing `hashchange` listener.** Browsers queue `hashchange` as a separate task, so wrapping a hash write in `flushSync` cannot make the new route render inside a transition callback. The route update must happen *inside* the callback, and the one place that already owns it is the listener at `LocalApp.tsx:32`. Change that listener to call a new helper, `frontend/src/lib/local/route-transition.ts`:

```ts
transitionRoute(prev: LocalRoute, next: LocalRoute, commit: () => void)
```

- If `document.startViewTransition` is missing, or `prefers-reduced-motion: reduce` matches, it calls `commit()` directly: today's exact behavior.
- Otherwise it sets `document.documentElement.dataset.navDirection`, then calls `document.startViewTransition(() => flushSync(commit))`, and clears the attribute on `transition.finished`. When the event fires, the old screen is still on the DOM, so the browser's "before" snapshot is correct. `flushSync(() => setRoute(next))` renders the new screen synchronously for the "after" snapshot.
- Direction is inferred from the route pair, not from call sites. Tab-level routes (plan, cookbook, shop, pantry, import, settings) are depth 0, recipe detail is 1, and edit/cook are 2. Deeper means `"push"`, shallower means `"pop"`, and a different route at the same depth means `"tab"`. Browser back, swipe-back and deep links get the right direction for free.
- No link interception and no new `LocalLink` component: every existing `<a href="/app#/...">` keeps working unchanged. The initial `onHashChange()` call on mount commits directly, without a transition.

**3. Card → title morph.** Give the cookbook card title (`LocalScreens.tsx:88`) a `data-recipe-title={item.id}` attribute, and the recipe detail `<h1>` (`RecipeDetail.tsx:105`) `style={{ viewTransitionName: "recipe-title" }}`. When `transitionRoute` sees cookbook → recipe `id`, it sets `viewTransitionName = "recipe-title"` on the one matching card title before calling `startViewTransition`. For the reverse (`pop`), it tags the matching card inside the callback, after commit. Only one element ever carries the name at a time, so a long cookbook list doesn't capture dozens of snapshots. Scope is exactly this one pair; a generic convention is a later plan's call. `::view-transition-group(recipe-title-*)` uses `--duration-base`/`--ease-out-soft`.

**4. Direction-aware transitions.** Default: cross-fade at `--duration-fast`. Under `[data-nav-direction="push"]`: old view fades/slides left-under, new view slides in from the right. `"pop"` reverses it. `"tab"`: cross-fade only (tabs are lateral, not hierarchical). All defined once in `globals.css` under `@media not (prefers-reduced-motion: reduce)`, using `::view-transition-old(root)`/`::view-transition-new(root)`.

**5. Reduced motion.** CSS: one global rule — `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }` — this also neutralizes both existing `animate-pulse` usages and all 28 `transition-colors` call sites without touching any of them individually. JS: `route-transition.ts` checks `matchMedia("(prefers-reduced-motion: reduce)").matches` before ever calling `startViewTransition` (a reduced-motion transition still snapshots and paints, which is wasted work and can still read as motion) and commits the route directly.

**6. `@starting-style` for `Sheet`/`Dialog`.** Once plan 03 lands the shared components, open/close should animate via `@starting-style` (`opacity`, `translateY` for the bottom-sheet case) instead of the current abrupt mount. This plan supplies the CSS pattern; the `Sheet.tsx`/`Dialog.tsx` edit itself happens in plan 03's PR (or a fast-follow here if 03 has already shipped) so the styling doesn't fork across two plans touching the same file.

**7. Press feedback on primitives.** `Button`/`Card` (plan 03) get `active:scale-[0.98] transition-transform` by default, matching the cook mode precedent exactly. Migrating cook mode's raw buttons and `TimerSheet.tsx:98,112` onto the new primitives is plan 04's job, not duplicated here.

**8. List stagger.** For the cookbook grid (`LocalScreens.tsx:86-89`) and similar lists: CSS-only stagger via `animation-delay: calc(var(--stagger-index) * 30ms)` set as a per-item inline custom property, capped around 6 items so a long list doesn't feel sluggish. Opacity/`translateY(4px)` only, `--duration-fast`, skipped under reduced motion by the same global rule.

## Implementation steps (PR-sized, ordered)

1. Motion tokens JS mirror + reduced-motion global CSS rule (`globals.css`) — no visible change, lands first.
2. `route-transition.ts` (fallback, reduced-motion guard, direction inference) wired into the `LocalApp.tsx` `hashchange` listener, with unit tests. jsdom has no `startViewTransition`, so CI exercises the fallback; a mocked `startViewTransition` test asserts the callback commits synchronously.
3. Direction-aware `::view-transition-old/new(root)` CSS for `tab`, `push` and `pop`.
4. Card ↔ title morph (`data-recipe-title` plus the `recipe-title` name on the detail `<h1>`).
5. List stagger on the cookbook grid.
6. `@starting-style` pattern for `Sheet`/`Dialog` (coordinate timing with plan 03).
7. Press-feedback default on `Button`/`Card`, checked against cook mode's existing feel ahead of plan 04.

## Tests and verification

- New `route-transition.test.ts`: fallback when `startViewTransition` is missing (the default jsdom case); reduced-motion fallback (mock `matchMedia`); direction inference for every route-kind pair; with a mocked `startViewTransition`, the commit runs synchronously inside the callback and `data-nav-direction` is cleared afterwards.
- `LocalApp.test.tsx`: hash navigation still renders the right screen (fallback path).
- `MobileTabBar.test.tsx` and all link markup stay unmodified; nothing intercepts clicks.
- `frontend/e2e/navigation.spec.ts` and `pwa-*.spec.ts` must keep passing. With `reducedMotion: "reduce"` (below) they exercise the fallback path.
- **Playwright stability:** set `reducedMotion: "reduce"` in `frontend/playwright.pwa.config.ts`'s `use` block (Playwright's built-in option, no new dependency) so PWA e2e never races a view transition; run one manual pass with `reducedMotion: "no-preference"` before merging step 5 to confirm the animation itself isn't masking a bug.
- `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa` per the shared contract.

## Risks and open questions

- Same-document View Transitions ship in Chromium, Safari 18+, and Firefox 144+; older browsers take the fallback path with no regression.
- Some screens load data asynchronously. If the destination is still showing a loading state when `flushSync` returns, the "after" snapshot is the loading state and the title morph has nothing to land on. Mitigation: render recipe detail from the already-loaded library snapshot where possible; otherwise let the callback return a promise that resolves when the destination title mounts, capped at ~150ms so navigation never stalls.
- `flushSync` inside a `hashchange` handler is safe: it runs outside React's render phase.

## Acceptance criteria

- [ ] Route changes fall back to today's exact behavior when unsupported or reduced-motion is set; no visible regression anywhere.
- [ ] Cookbook card → recipe title share a `view-transition-name` and animate as one element across the navigation.
- [ ] Tab navigation cross-fades; push/pop slides directionally.
- [ ] `prefers-reduced-motion: reduce` removes all animation/transition duration app-wide via one global rule.
- [ ] `Button`/`Card` press feedback matches cook mode's existing `active:scale-[0.98]` feel.
- [ ] Playwright PWA suite runs with `reducedMotion: "reduce"` and isn't flaky across 3 consecutive local runs.
- [ ] No new npm dependency added.

## Implementation notes

Branch `claude/premium-ui-06-motion`, cut from `b895973`. Two subagents did the overlay/menu/tab-pill entry and the press feedback on disjoint files; I reviewed their diffs and ran every check myself.

### Shipped

- `97a75e5` **Motion CSS, reduced motion, shared rise.** One delimited `/* ── Motion (plan 06) ── */ … /* ── End motion (plan 06) ── */` block at the end of `globals.css`:
  - A `rise` keyframe (opacity plus `translate: 0 var(--rise-from, 12px)`) and an `animate-rise` utility (`--duration-base`, `--ease-out-soft`) declared in a second plain `@theme`. **`cook-rise` is folded into it:** the keyframes, class and local reduced-motion rule are deleted from the plan 04 block, and `CookDoneView`/`MarkOutOfStep` use `animate-rise`. The look is the same 12px rise.
  - The cookbook stagger (`[data-stagger]`: 4px rise at `--duration-fast`, `animation-delay: calc(min(var(--stagger-index), 6) * 30ms)`).
  - The overlay backdrop fade (`[data-overlay-backdrop]` transition plus `@starting-style { opacity: 0 }`).
  - View-transition rules. `header:has(#app-header-status)` and `[data-mobile-tabbar]` get their own groups (`app-header`, `app-tabbar`) so the chrome holds still while the page moves. The default and `tab` transitions are a `--duration-fast` cross-fade. `push` slides the new screen in from the right (12%) over the old one drifting left (8%) and fading, at `--duration-base`; `pop` mirrors it. The `recipe-title`/`recipe-cover` groups morph at `--duration-slow`. The cover's old/new images fill and crop (`object-fit: cover`) because the card is 16:9 and the detail 16:10 or a 240px banner. All of this sits under `@media not (prefers-reduced-motion: reduce)`.
  - The global rule from §5, plus `animation-delay: 0s !important` so a staggered card never waits invisible under reduced motion.
  - `playwright.pwa.config.ts`: `contextOptions: { reducedMotion: "reduce" }`. `reducedMotion` is not a top-level `use` option in Playwright 1.60's types, so it goes through `contextOptions`.
- `65adfa7` **Route transitions.** New `lib/local/route-transition.ts`: `routeDepth`, `navDirection`, `sameRoute`, `prefersReducedMotion` and `transitionRoute(prev, next, commit)`.
  - It commits directly when `startViewTransition` is missing, under reduced motion, or when the route didn't change.
  - Otherwise it sets `data-nav-direction`, names the morph pair on the old side, and calls `document.startViewTransition(() => { flushSync(commit); … })`. Inside the callback it clears the old names and names the new side.
  - On `finished` it clears the names and removes the attribute, but only if no newer transition has started (a token counter).
  - `LocalApp`: the listener keeps the previous route in a ref and calls `transitionRoute`. The read on mount, and after an account switch, stays a direct `setRoute`.
  - Tests: `route-transition.test.ts` (24) covers depth, every direction pair, the three fallbacks, the synchronous commit inside the callback, the direction cleared on `finished` and kept for a newer transition, naming only the tapped card and then only the detail, the pop pairing, skipping an off-screen card, and no names on other navigations. `LocalApp.transition.test.tsx` (2): the new screen is on the page when the callback returns, with direction `push`; mount doesn't transition; reduced motion never calls `startViewTransition`.
- `593336c` **Morph hooks and stagger.**
  - `CookbookCard`: `data-recipe-card={id}` on the link and `data-recipe-title` on the title. `RecipeCover`'s existing `data-recipe-cover` is the cover hook.
  - `RecipeDetail`: `data-recipe-detail={id}` on the page root and `data-recipe-title` on the `<h1>`.
  - Names are set only by `route-transition.ts`, never statically, so at most one title and one cover carry them.
  - The stagger (`data-stagger` plus `--stagger-index`) is skipped when the cookbook mounts during a `pop`, because the returning card is mid-morph and shouldn't also fade in. `LocalScreens` passes `index`.
- `b951f62` **`@starting-style` entry** through Tailwind's `starting:` variant:
  - `Sheet`: a full-height slide-up below `md:`; from `md:` an 8px lift, a 0.98 scale and a fade, at `--duration-base`/`--ease-out-soft`.
  - `Dialog`: a fade plus scale from 0.96.
  - `Menu` popover: a fade plus scale from 0.95 at `--duration-fast`, with `origin-top-right`/`origin-top-left` by `align`. The header `+` menu gets this too.
  - Tab pill: the active pill is now its own element (`data-tab-pill`, inside an `isolate` wrapper), mounted only on the active tab, so it scales in from `scale-x-50` with `--ease-spring` on every tab change. Icon, labels and `aria-current` are unchanged.
  - One class test was added in each of `Sheet`, `Dialog`, `Menu` and `MobileTabBar`.
- `85c4523` **Press feedback.**
  - `Button` base: `not-disabled:not-aria-disabled:active:scale-[0.98]`, and `transition-colors` becomes `transition-[color,background-color,border-color,scale]` at `--duration-fast`/`--ease-out-soft`. It compiles to `:not(:disabled):not([aria-disabled=true]):active{scale:.98}`, so disabled, loading and `aria-disabled` buttons and links don't move.
  - Interactive `Card`: `active:scale-[0.99]` with `transition-[box-shadow,scale]`. It is 0.99 rather than 0.98 because a full-width card at 0.98 reads as a lurch. Non-interactive cards are unchanged.
  - One test each.

### Deviations

- **No `lib/motion-tokens.ts`.** No JS reads a duration: every timing lives in CSS rules that use the tokens directly. A mirror would only be a second copy that could drift. Add it when something in JS needs a number.
- **The cover morphs too**, not just the title, per the wave 2 handoff. The plan's `recipe-title-*` wildcard became two fixed names, `recipe-title` and `recipe-cover`.
- **Names are set on both sides imperatively.** The plan put a static `viewTransitionName` on the detail `<h1>`. A static name would lift the title out of the page on every other transition from recipe detail (to edit, cook or a tab) and animate it on its own. Setting both sides from `route-transition.ts` keeps the name on screen only during the morph.
- **Off-screen cards don't morph.** If the matching card isn't in the viewport (a long, scrolled library), there is no morph and the route transition runs alone.
- **Backdrop fade is in `globals.css`, not `Overlay.tsx`.** Plan 09 is changing the backdrop's `bg-ink/40` class on that line in parallel, so this plan doesn't touch `Overlay.tsx` at all. The rule targets `[data-overlay-backdrop]`.
- **Tab pill is a transition on a mounted element.** The old pill was a class toggle on a span that persists across navigation, and `@starting-style` doesn't fire on a class change, so the active pill is now a separate element rendered only when active.
- **Stagger duration** follows the plan (`--duration-fast`, 4px, 30ms steps capped at 6). It also runs on tab switches into the cookbook, inside the cross-fade.
- **No loading-state wait.** Recipe detail renders from the already-loaded snapshot, so `flushSync` always lands on the real destination. The promise-returning mitigation from Risks wasn't needed.

### Checks

Run from `frontend/` after `pnpm install --frozen-lockfile`, with CI's public env and the 1194→1223 headless-shell shim:
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 70 files, 535 tests pass (baseline 503; 32 new).
- `pnpm build`: pass. The emitted CSS contains the `::view-transition-*` rules, `data-nav-direction` selectors, the `rise`/`nav-*` keyframes, the reduced-motion rule and 9 `@starting-style` blocks.
- `pnpm test:pwa`: 10/10 pass on 3 consecutive runs with `reducedMotion: "reduce"`, and 10/10 on one manual pass with `"no-preference"` (a temporary config copy, not committed).
- **Real browser** (Chromium 1194 against `next start`, a restored 4-recipe library, animations slowed to 0.1× over CDP), at 393×852 and 1280×860:
  - Card → detail sets `data-nav-direction="push"` and names exactly one `recipe-title` and one `recipe-cover`. `document.getAnimations()` shows the `root`, `recipe-title`, `recipe-cover`, `app-header` and `app-tabbar` groups.
  - After `finished`, the attribute and all names are cleared.
  - Back sets `pop` and morphs the cover back into its card. A tab switch sets `tab`.
  - The Menu popover transitions `opacity` and `scale`. The Dialog opens fully.
  - Mid-transition screenshots show the cover and title flying between card and banner, with the old page sliding out.
  - With `reducedMotion: "reduce"`, `startViewTransition` is called 0 times (5 times without it), no direction attribute is ever set, and computed transition durations are `1e-05s`.

### Handoffs

- **Plan 09 / coordinator (`globals.css`):** this branch deletes the `cook-rise` lines at the end of the plan 04 cook block. Only one blank line separates them from `[data-cook-theme="dark"] [data-overlay-backdrop]`, which plan 09 is removing. If the merge conflicts there, keep both deletions. Plan 06 didn't touch the cook block's token overrides.
- **Plan 09 (`Button.tsx`):** only the `base` string changed (`transition-colors` became the longer transition list plus the press variant), so your `variants` edit shouldn't conflict.
- **Plan 09 (`Overlay.tsx`):** untouched here, so it's all yours.
- **Plan 07 files, noted but not changed:** hash navigation never resets scroll, so tapping a card low in the cookbook opens the detail at the same scroll offset. This is today's behavior, not something the transitions introduced; the morph still lands because it follows the real positions. Scrolling to the top on a push would be a small `LocalApp` follow-up, but it changes behavior, so I left it out of a motion plan.

### Needs a device

- View transitions and the card morph in an installed iOS 18+ home-screen app. Check the header and tab bar holding still, and `black-translucent` with the status-bar scrim during a slide.
- iOS Safari's edge-swipe back: Safari animates its own swipe and then fires `hashchange`. Check whether our `pop` transition plays a second, redundant slide after the native gesture. If it does, the fix is to skip the transition on `pop` for back-forward navigations on iOS.
- `@starting-style` (Safari 17.5+) on the bottom sheet slide, the menu and the tab pill.
- Press feedback feel on `Button`, and on a full-width cookbook card during scroll (no accidental scale while flicking).
- Reduce Motion in iOS Settings turns off every transition and animation, including the cook `animate-rise`.
