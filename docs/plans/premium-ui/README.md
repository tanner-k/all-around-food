# Plan set: Premium UI

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Branch convention:** implementation PRs target `dev`; one PR per plan (or per phase inside a plan).

## Why

The `/app` PWA already has a clear editorial direction — Instrument Serif display with Manrope body, warm cream (`#FAF7F2`) and terracotta (`#C2613B`), italic accent words, numbered section heads. It reads as utilitarian, not premium, because of noise, dead space, and inconsistent finish:

- The sync card renders above content on every screen, including recipe detail and cook mode (`frontend/src/components/app/LocalApp.tsx:51`).
- Every cookbook card and recipe hero is a permanent empty `bg-paper-2` block; recipes have no image field (`LocalScreens.tsx:87-89`, `RecipeDetail.tsx:111`).
- No shared primitives (Button, Card, Sheet, Dialog). `#A55230` is hard-coded 18 times; errors use raw Tailwind `red-*`; five radius scales; five shadows total.
- No motion system, no `prefers-reduced-motion`, no dark mode, no Screen Wake Lock in cook mode.

The fix is finish and restraint, not a new visual language. Original design intent lives in `docs/design/` (`chat-history.md`, `screens-chosen.jsx`, `screens-cook.jsx`, `Cookbook App Flow.html`).

## Plans

| # | Plan | Size | Depends on |
|---|---|---|---|
| 01 | [Sync status out of the content path](./01-sync-status.md) | S | — |
| 02 | [Recipe imagery: typographic cards, then optional photos](./02-recipe-imagery.md) | M / L | 03 |
| 03 | [Design tokens and UI primitives](./03-design-tokens-and-primitives.md) | M | — |
| 04 | [Cook mode as the showcase](./04-cook-mode.md) | M | 01, 03 |
| 05 | [Recipe detail hierarchy and actions](./05-recipe-detail-actions.md) | M | 03 |
| 06 | [Motion system](./06-motion.md) | M | 03 |
| 07 | [Navigation and iOS frame](./07-navigation-and-ios-frame.md) | S / M | 03 |
| 08 | [Week plan layout](./08-week-plan.md) | M | 03 |
| 09 | [Dark mode](./09-dark-mode.md) | M | 03 |
| 10 | [Detail polish](./10-detail-polish.md) | S | 03 |

**Recommended order:** 01 → 03 → 02 (phase 1) → 04 → 05 → 07 → 08 → 06 → 10 → 09 → 02 (phase 2, photos).
01 is independent and the most visible win. 03 is the foundation that keeps every later plan consistent. Motion and dark mode land after primitives so they are applied once, centrally.

## Shared contract

Every plan uses these names so the set stays coherent. Plan 03 owns their implementation; other plans consume them and must not invent parallel versions.

**Location:** `frontend/src/components/ui/` — one component per file, PascalCase, co-located test (per `frontend/context.md`).

**Primitives (plan 03):**
- `Button` — variants `primary | secondary | ghost | danger`; sizes `sm | md | lg`; `asChild`-free (render `<a>` via an `href` prop).
- `IconButton` — square, 44×44 minimum hit area, required `aria-label`.
- `Card` — surface with the shared radius, border, and shadow tokens; optional `interactive` state.
- `Sheet` — bottom sheet on mobile, centered panel on desktop; one shared focus trap (`lib/focus-trap.ts`), backdrop, Escape/overlay close.
- `Dialog` — confirmation dialog (replaces `window.confirm`), built on the same overlay as `Sheet`.
- `Menu` — small overflow menu (for "⋯" actions).

**Tokens (plan 03), defined as CSS custom properties so plan 09 can override them per theme:**
- Colors keep today's names (`bg`, `paper`, `paper-2`, `ink`, `ink-soft`, `ink-mute`, `line`, `line-strong`, `terra`, `terra-soft`, `forest`, `forest-soft`, `warn`, `warn-soft`) and add `terra-strong` (replaces `#A55230`), `danger`, `danger-soft`, and `focus`.
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, plus `rounded-full` for pills.
- Shadows: `--shadow-card`, `--shadow-raised`, `--shadow-overlay` (layered, warm-tinted, low opacity).
- Motion: `--ease-out-soft`, `--ease-spring`, `--duration-fast` (~120ms), `--duration-base` (~220ms), `--duration-slow` (~360ms).

**Platform facts to rely on (verified 2026-09-28):**
- Same-document View Transitions ship in Safari 18+; `@starting-style` in Safari 17.5+.
- Screen Wake Lock works in iOS home-screen web apps from iOS 18.4.
- `viewportFit: "cover"` is already set; only the tab bar uses safe-area insets today.

**Constraints for all plans:**
- Keep `/app` screens local-first: no new Supabase or FastAPI calls in the `/app` client import tree.
- Prefer zero new dependencies (no animation or component libraries); justify any exception against `package.json`.
- Changing visible copy or roles breaks e2e/unit selectors (e.g. "Plan your week.", "+ Add recipe", "Review shopping →", "Merge backup", "Offline ready"). Each plan lists the tests it must update.
- CI gates: `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`. Physical iPhone/iPad checks are listed separately; local passes do not prove them.

## Plan template

Each plan follows: Status/Date/Owner header · Goal · Current state (with `file:line` evidence) · Scope and non-goals · Design · Implementation steps (PR-sized, ordered, concrete files) · Tests and verification · Risks and open questions · Acceptance criteria (checklist).
