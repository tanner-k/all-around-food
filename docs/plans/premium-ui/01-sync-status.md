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
