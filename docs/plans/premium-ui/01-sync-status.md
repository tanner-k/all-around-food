# Plan 01 — Sync status out of the content path

**Status:** Proposed
**Date:** 2026-09-28
**Owner:** Tanner
**Depends on:** — (shippable before Plan 03; see "Before Plan 03 exists")

## Goal

Stop rendering the full "Sign in to sync" card above every screen. Replace it with a compact status indicator (dot + label) in the header, visible everywhere except cook mode; keep full detail in Settings; escalate inline only for states that genuinely need attention (conflicts, sync errors).

## Current state

- `frontend/src/components/app/LocalApp.tsx:51` renders `<SyncStatus sync={sync} />` unconditionally, above `{error}` and `LocalScreens`, outside the `route.view` switch — so it's identical on plan, cookbook, recipe detail, cook mode, shop, pantry, import, and settings.
- `frontend/src/components/app/SyncStatus.tsx`: `SyncStatus` is a hydration guard (`"Checking your library…"` pre-mount, then `AccountSyncStatus`). `AccountSyncStatus` is a ~50-line `<section>` with a label, an "Account / Settings" self-link, pending/last-sync copy, "Sync now", stage-specific paragraphs, an error paragraph, and (when `status.conflicts`) a full conflict-review flow with per-field diffs and "Use this device version"/"Use cloud version".
- `frontend/src/components/settings/DataSettings.tsx:116` already has its own Account card with its own Sign in/Sign out — so Settings today shows the generic sync card *and* a separate account block. Redundant; this plan removes it.
- `useLibrarySync()` (`frontend/src/components/app/useLibrarySync.ts`), called once in `LocalApp`, returns `{ account, status, running, authRequired, ready, stage, syncNow }` and owns all side effects (auth check, sync pass, 30s poll, online/offline/focus/visibility listeners), gated on `account.ownerId`/foreground — not on route.

## Every state, and where it surfaces

`AccountSyncStatus`'s label logic (`SyncStatus.tsx:25`) picks the first match, in order:

| # | Condition | Label | New surface |
|---|---|---|---|
| 0 | Not yet hydrated | "Checking your library…" | Chip only, briefly |
| 1 | `status.conflicts > 0` | "Review changes" | Chip **+ inline banner** |
| 2 | `status.error`, category `protocol`/`validation`/`transient` | "Sync needs attention" | Chip **+ inline banner** |
| 3 | `authRequired \|\| !account.ownerId` | "Sign in to sync" | Chip → Settings |
| 4 | `status.pending \|\| (stage==='all' && status.deferred) \|\| !ready \|\| stage==='off'` | "Saved on this device · waiting to sync" | Chip only |
| 5 | `running \|\| !status.lastSuccessAt` | "Connecting your library" | Chip only |
| 6 | else | "Up to date" | Chip only |

Pending/deferred counts, last-sync timestamp, "Sync now", and the stage explainer paragraphs are Settings-only. Rows 1-2 put a *summary* inline where the old card sat; the full review list still expands there (it's an in-place action), not in Settings. `error?.category === 'account'`/`'paused'` stay excluded from "actionable" (`SyncStatus.tsx:24`) — unchanged.

**Sign-out confirmation:** `SignOutButton` (`frontend/src/components/auth/SignOutButton.tsx`) has no confirm dialog today; it's a plain submit, already confined to `DataSettings`'s Account card, not `SyncStatus`. Unaffected by this plan — if Plan 03/05 later adds a `Dialog`, it should stay in Settings, not the header chip.

**Out of scope, flagged:** `ServiceWorkerRegister.tsx:183` renders a separate "Offline ready" pill (fixed bottom-right, all pages, including cook mode). Not part of `SyncStatus`/`useLibrarySync`; untouched here, but it's a second floating status affordance that will compete visually with the new chip — worth a follow-up decision.

## Scope and non-goals

In scope: `LocalApp.tsx`, `SyncStatus.tsx` (split into two exports), `layout.tsx` (an empty header slot), `LocalScreens.tsx` and `DataSettings.tsx` (full-detail mount). `MobileTabBar.tsx` is Plan 07's.
Non-goals: redesigning conflict-review content, a `Sheet`/popover for the chip, touching `ServiceWorkerRegister`.

## Design

1. **`SyncStatusChip`** (new): small `role="status"` pill — dot (color by category) + today's label text unchanged, so no copy is invented. The *only* live region for the label (avoids double announcements). Links to `/app#/settings`. Shown in the header on mobile and desktop alike: the header's brand row already renders at all widths (only the desktop text links are `hidden md:flex`), so no separate mobile mount point is needed. See item 5 for how it gets there without moving the sync hook.
2. **`SyncAttentionBanner`** (renamed from `AccountSyncStatus`): today's full markup, mounted only when `status.conflicts > 0` or the error is actionable.
3. **Settings integration:** the same component, given an `embedded` prop, mounted *unconditionally* in `DataSettings.tsx` next to its Account card (line 116). `DataSettings` receives `sync` as a prop from `LocalScreens.tsx:75`, which already receives props from `LocalApp`. `embedded` suppresses the self-referential "Account / Settings" link and the "Sign in" link (Settings already has one), so `DataSettings.test.tsx:42`'s `getByRole("link", {name:"Sign in"})` still resolves to one element.
4. **Cook mode:** `LocalApp` renders neither the banner nor the chip when `route.view === "cook"`. The chip only exists while `LocalApp` is mounted, so it is absent off `/app` automatically.
5. **Getting the chip into the header without moving the hook.** `frontend/context.md` makes `LocalApp` the owner of `useLibrarySync` (account isolation, cancellable foreground passes, sign-out handling). Lifting it into a root-layout provider would put that logic above every route, including `/login`, and change when it mounts. Instead:
   - `layout.tsx` renders an empty `<span id="app-header-status" />` next to the brand mark.
   - `LocalApp` keeps `const sync = useLibrarySync()` exactly as today and renders `<SyncStatusChip sync={sync} />` into that slot with `createPortal`, after mount (look the node up in an effect, and render nothing until it exists).
   - Result: one hook instance, same lifecycle as today, and no new Supabase activity on any route. If plan 04 or 07 later extracts the header into `AppHeader.tsx`, the slot moves with it.

## Before Plan 03 exists

No `Button`/`IconButton`/`Sheet`/`Menu`/tokens needed. The chip is a plain `<a>`/`<button>` on existing Tailwind classes and today's color names (`bg-terra-soft`, `text-warn`, `text-forest`, already used in `SyncStatus.tsx`). No popover is built — the chip always navigates to Settings; Plan 03 can later upgrade it to a `Sheet`/`Menu` preview as a follow-up.

## Implementation steps

1. Split `SyncStatus.tsx`: extract `SyncAttentionBanner` (ex-`AccountSyncStatus`, add `embedded?: boolean`) and `SyncStatusChip`. Keep `Readable` (used by `RecipeCopySettings.tsx`) unchanged.
2. Add the `#app-header-status` slot in `layout.tsx`; `LocalApp` portals `<SyncStatusChip sync={sync} />` into it (skipped on cook routes).
3. `LocalApp.tsx`: replace the unconditional card with `<SyncAttentionBanner sync={sync} />` gated on `route.view !== "cook"` and (conflicts or actionable error).
4. `LocalScreens.tsx` passes `sync` to `DataSettings`; `DataSettings.tsx` mounts `<SyncAttentionBanner sync={sync} embedded />` unconditionally near the Account card.
5. Update `frontend/context.md`'s "Account library sync" section (workflow rule 3).

## Tests and verification

- `"Sign in to sync"`, `"Checking your library"`: only in `SyncStatus.tsx` and `frontend/src/components/app/__tests__/SyncStatus.test.tsx` — rewrite that file around the two new exports (line 47's hydration assertion, the label-priority `it.each`, and the conflict-review tests move to `SyncAttentionBanner`).
- `"Offline ready"`: **not** in `SyncStatus.tsx` — it's `ServiceWorkerRegister.tsx:183`; its e2e assertions (`pwa-offline.spec.ts`, `pwa-planning.spec.ts`, `pwa-recipe-copy.spec.ts`) are unaffected.
- `frontend/e2e/pwa-import.spec.ts:104`: `getByText("Up to date", { exact: true })` — keep verbatim in `SyncStatusChip`.
- `DataSettings.test.tsx:42`: `getByRole("link", {name:"Sign in"})` must still resolve to one element — needs the `embedded` suppression above.
- `useLibrarySync.test.tsx`: unaffected, since the hook doesn't move; re-run it anyway.
- Add a `LocalApp` test asserting the chip is portaled into `#app-header-status` on normal routes and absent on a cook-mode hash.
- Full gate per README: `pnpm lint`, typecheck, `pnpm test`, `pnpm build`, `pnpm test:pwa`.

## Risks and open questions

- The portal target is server-rendered by the layout; if a later header refactor drops `#app-header-status`, the chip silently disappears. Cover it with the `LocalApp` test above and an e2e check for the chip text.
- Chip color-coding needs a color decision from the owner since Plan 03's `danger`/`focus` tokens don't exist yet — pick from today's palette, let Plan 03 swap it in later.
- Should the chip link straight to `/login` when signed out, instead of Settings? Left as Settings for consistency; flagged for the owner.

## Acceptance criteria

- [ ] No sync UI above content on any screen except when conflicts or an actionable error exist.
- [ ] Nothing sync-related renders in cook mode.
- [ ] A compact chip is visible in the header on every `/app` screen except cook mode, one `role="status"` live region.
- [ ] Settings shows full detail unconditionally, with exactly one "Sign in" link.
- [ ] All listed tests updated and passing; `"Up to date"`/`"Offline ready"` strings unchanged.
- [ ] `frontend/context.md` updated.

## Implementation notes

Branch `claude/premium-ui-01-sync-status`, cut from the plan-set commit `e98a69b`.

**Shipped:**
- `69ca468` feat(sync): move sync status into a header chip and Settings.
  - `SyncStatus.tsx`: `SyncStatus` is replaced by two exports. `SyncStatusChip` is a pill-shaped `<a href="/app#/settings">` with a colored dot and the unchanged label in the only `role="status"`. It shows "Checking your library…" before hydration. `SyncAttentionBanner` is the old `AccountSyncStatus` behind the same hydration guard. It takes `embedded?: boolean`, which adds a "Library sync" heading and removes the "Account / Settings" self-link and the "Sign in" link. The label logic moved into `syncLabel()` with the same order. New `syncNeedsAttention()` returns true for conflicts or an actionable error. The banner's label paragraph no longer has `role="status"`, so the chip is the only live region. `Readable` is unchanged.
  - Dot colors use today's palette: `bg-warn` for "Review changes" and "Sync needs attention", `bg-ink-mute` for "Sign in to sync", `bg-forest` for "Up to date", and `bg-terra` for waiting, connecting and checking. Plan 03 can switch these to `danger`/`focus` tokens.
  - `layout.tsx`: adds an empty `<span id="app-header-status" className="-ml-5 flex min-w-0" />` right after the brand mark. Nothing else in the header changed.
  - `LocalApp.tsx`: still calls `useLibrarySync()` exactly as before. It finds the slot with `useSyncExternalStore`, using `null` on the server, and portals `<SyncStatusChip />` into it. It renders `<SyncAttentionBanner />` only when `syncNeedsAttention(sync)` is true. Neither renders when `route.view === "cook"`. It passes `sync` to `LocalScreens`.
  - `LocalScreens.tsx`: accepts an optional `sync` prop and passes it to `DataSettings`.
  - `DataSettings.tsx`: accepts an optional `sync` prop and mounts `<SyncAttentionBanner sync={sync} embedded />` whenever it is present, right after the Account card.
  - Tests:
    - `SyncStatus.test.tsx` is rewritten around the two exports. It covers label priority on the chip, a single live region linking to Settings for every non-attention label, the `syncNeedsAttention` rules, the embedded mode dropping both links, and the hydration shell for both components. The existing conflict-review tests now target the banner.
    - `LocalApp.test.tsx` gains a test that the chip is portaled into `#app-header-status`, that no banner appears in the normal state, that the slot empties on a cook route, and that Settings shows the full detail with exactly one "Sign in" link.
    - `DataSettings.test.tsx` gains a test that `sync` renders the full detail with one "Sign in" link and a working "Sync now".
- `ebc993e` docs(frontend): the "Account library sync" section of `frontend/context.md` now describes the chip, the banner, the Settings mount and the slot.

**Deviations:**
- `sync` is optional on `LocalScreens` and `DataSettings`, so existing tests that render them without it still compile. The only caller in the app, `LocalApp`, always passes it.
- In Chromium, the chip link had no accessible name because the text sits inside a `role="status"` child. I added `aria-label={label}` to the link, so its name is the label text.
- The embedded Settings card shows a "Library sync" heading. That text was already the section's `aria-label`, and `RecipeCopySettings` already tells users to "Check Library sync", so no new wording was added.
- `e2e/pwa-import.spec.ts` changed because "Sync now" and "Syncing…" are now only in Settings. The test switches the hash to `#/settings` to press "Sync now" and to check "Syncing…" while the pull is held, then switches back to `#/import`. Hash changes don't reload the page, so the held pass is still the same one. Line 104's `getByText("Up to date", { exact: true })` is unchanged; it now matches the chip. I also added a check that `#app-header-status` holds a link named "Up to date" pointing to `/app#/settings`.

**Checks:** all run from `frontend/` after `pnpm install --frozen-lockfile`.
- `pnpm lint`: pass.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm exec vitest run`: 43 files, 370 tests pass (baseline 362 plus 8 new).
- `pnpm build`: pass.
- `pnpm test:pwa`: 7 of 7 pass, with two setup differences from a plain run:
  - The build used CI's environment: `NEXT_PUBLIC_SUPABASE_URL=https://aaf-mock.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key`, `NEXT_PUBLIC_ACCOUNT_SYNC_STAGE=recipes`. Without it, the import spec can't reach "Up to date" on any branch.
  - This repo's Playwright expects `chromium_headless_shell-1223`, but the container has `-1194`. I ran the same config through a temporary wrapper, not committed, that only sets `launchOptions.executablePath` to `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`. A plain `pnpm test:pwa` here fails at browser launch before any test runs.
- Screenshots at 393×852 and 1280×860 of `/app#/plan` and `/app#/settings`, signed out, look right. On a phone, a long label such as "Saved on this device · waiting to sync" is truncated with an ellipsis in the chip; the full text stays in the accessible name and in Settings.

**Handoffs:**
- Plan 07 (header): keep `#app-header-status` next to the brand when the header moves into `AppHeader.tsx`. Its `-ml-5` offsets the nav's `gap-8`. The chip is about 30px tall, under the 44px touch target, so size it with the header's touch rules. Hiding the header on cook routes has no effect on the chip, since `LocalApp` already leaves it out.
- Plan 03: swap the chip's dot colors to the `danger`/`focus` tokens, and later upgrade the chip to a `Sheet`/`Menu` preview if wanted.
- Out of scope, still open: the "Offline ready" pill in `ServiceWorkerRegister.tsx` also floats on every page, including cook mode.

**Needs a device:**
- Header fit with the `black-translucent` status bar and safe-area insets on an iPhone, once plan 07 lands.
- VoiceOver reading the chip's name and announcing label changes, on iOS and iPadOS.
