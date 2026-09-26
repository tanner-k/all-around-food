# 0010 — Offline-first account library synchronization

**Status:** Accepted for implementation; hosted rollout unverified
**Date:** 2026-09-25
**Extends:** ADR 0008's device-first library. ADR 0008 remains the historical record of the earlier PWA milestone.

## Context

IndexedDB lets the installed app work offline, but a recipe saved on one device does not appear on another. Backup files provide manual recovery. The owner now wants the same library after signing into the same account on an iPhone, iPad, and Mac, without making normal cooking depend on network access or the Mac import worker.

## Decision

Keep IndexedDB as each device's working copy and add an owner-scoped Supabase library as its durable exchange point. New `library_records` rows hold the current projection, while private revision heads, immutable change batches, and mutation receipts define the sync protocol. A browser can read only the configured authenticated owner's projection and can mutate records only through a version-checked RPC. The RPC derives the owner from Supabase Auth, serializes each account's commits under its head row, and records a complete change group and retry receipt in the same transaction.

A client uploads at most 100 changes and 1 MiB per atomic group. A stale base revision returns current conflicting rows, including retained tombstones; a never-created ID returns an explicit absence marker. Exact retry of an accepted mutation returns its original result. Pull pages contain whole committed revision groups from the immutable journal, so a later edit cannot alter an earlier page. Server revisions determine ordering; device clocks do not resolve conflicts.

The initial schema supports recipes, drafts, individual planned meals, shopping items, pantry items, and cooking sessions. Account enrollment and client outbox behavior follow the [account sync plan](../superpowers/plans/2026-09-25-account-sync.md). Legacy Supabase library tables and Parquet archives remain untouched.

## Consequences

- Signed-in devices can converge while continuing to save and read locally when offline. A new device needs an initial online sign-in and download.
- Conflicting edits and delete-versus-edit require review; stale clients cannot silently replace current rows.
- The journal, receipts, and tombstones are retained until a separately designed device-expiry and full-resync protocol exists.
- The import worker may later publish shared drafts through the same account revision lock; its current queue remains unchanged by this migration.
- This decision does not claim hosted deployment, existing-library enrollment, or physical-device validation. Those are separate release gates.
