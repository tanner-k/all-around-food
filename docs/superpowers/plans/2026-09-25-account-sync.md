# Offline-first account sync implementation plan

> For agentic workers: use `subagent-driven-development` or `executing-plans` to implement this plan task by task. Delegate bounded implementation and review tasks to Sol-level agents. Keep protocol, account-boundary, and rollout decisions coordinated by the orchestrator.

**Goal:** Signing into the same account on an iPhone, iPad, or Mac brings back the same kitchen library, while local use and editing continue offline.

**Architecture:** Keep IndexedDB as the local working copy and add a durable, owner-scoped library in Supabase. Every local change and its upload record commit together. Version-checked writes, persistent deletion markers, and retry identifiers prevent silent overwrites, resurrection, and duplicate operations.

**Stack:** Existing Next.js/React, TypeScript, `idb`, Zod, Supabase Auth/Postgres/RPCs, Vitest, and Playwright. No new hosting provider, always-on API server, or sync dependency is required for this first personal-account release. The Mac Mini continues parsing imports; ordinary library synchronization does not depend on it being awake.

**Status:** Plan only. No application code, hosted schema, or deployed behavior changed by this document.

## Starting point and scope

This plan is based on released commit `50894c8` in `.worktrees/mac-import-worker`, not the older, dirty root checkout. At implementation time, create a new `codex/` worktree from current `origin/main`, reconcile subsequent changes, and leave the running worker checkout and existing experimental changes alone.

Existing reusable pieces:

- `frontend/src/lib/local/db.ts`: IndexedDB database `aaf-local`, version 1.
- `local/repository.ts`: local mutations and same-browser tab notifications.
- `local/imports.ts`: offline requests, result receipt, durable drafts, explicit Save.
- `local/backup.ts` and `local/migrate.ts`: validated backups and additive legacy cloud copy.
- `components/app/useLocalImportSync.ts`: foreground import synchronization.
- Supabase Auth, owner policy, and migrations `0001`–`0005`.

The shared library includes saved recipes, reviewed/unreviewed drafts, planned meal occurrences and servings, shopping items, pantry items, and cooking sessions/progress. Device preferences, storage permissions, backup timestamps, credentials, unsent screenshot bytes, and active audio alarms remain local. Pending requests become visible on other devices only after submission reaches Supabase.

No household sharing, simultaneous collaborative text editing, automatic recipe deduplication by title/URL, remote image mirroring, push notifications, or guaranteed background synchronization in this release.

## Recommended design and alternatives

| Approach | Trade-off | Decision |
|---|---|---|
| Local records plus versioned Supabase synchronization | Reuses the app; supports offline edits and explicit conflict recovery | Recommended |
| Upload/download the entire library after every edit | Easy prototype, but one stale device can overwrite unrelated changes | Reject |
| Adopt a separate managed sync engine | Potentially useful at larger scope; adds dependency, migration, and operational decisions | Defer |

Saved data will now have a durable cloud copy. Each device remains usable offline with its downloaded library. A new device needs an initial online sign-in and download; a closed iPhone app is not promised to synchronize in the background.

### Product behavior

1. Sign in with the same Supabase account. Show **Connecting your library**, then **Up to date** after pending writes are acknowledged and the initial pull is applied.
2. Existing local data is never replaced by an empty cloud account. First connection previews local/legacy data, downloads a backup, binds it to the confirmed account, and merges it without deleting originals.
3. Show **Saved on this device · waiting to sync** for offline edits; show **Sign in to sync** for expired authentication and **Review changes** for conflicts.
4. Sync on launch, successful sign-in, reconnect, and foreground/focus; poll every 30 seconds while online and visible. Local commits also request a debounced sync. Real-time subscriptions are not necessary initially.
5. Online devices should converge within one polling interval plus network/processing time. Parsing can take longer and gets a separate processing status.
6. Add an obvious Settings/account entry to the mobile UI, plus **Sync now**, last successful sync, and pending-change count. Preserve the existing **Offline ready** indicator: cached app readiness and library sync are different facts.

### Conflict policy

- Different record IDs merge automatically. Meal slots synchronize individually, so adding Tuesday dinner does not replace somebody's Monday edit.
- Concurrent changes to the same recipe, draft, meal occurrence, shopping item, pantry item, or cooking session require review. Keep the local version and received server version until resolved; do not silently choose using device clocks.
- A resolution selects or edits the desired version and submits a new conditional write against the reviewed server revision. If the server changed again, request review again.
- Delete-versus-edit is also a conflict. An offline device must not silently resurrect a deleted record.
- Multi-record actions, such as completing shopping, are one mutation group: all changes succeed together or the group conflicts. Independent groups continue syncing.
- Keep this first version conservative. Field-level automatic merging and CRDTs are not prerequisites.

## Protocol contract

Create new sync tables rather than rewriting the legacy cloud library tables. Legacy IDs are globally keyed and their plan representation omits some current local fields; direct mirroring would entangle two different models.

### Hosted storage

- `library_records`: primary key `(owner_id, kind, entity_id)`; `schema_version`, JSON payload, server revision, server timestamp, and deletion marker. Restrict `kind` to explicitly supported collections. IDs remain text because existing recipes are not all UUIDs.
- Private `library_sync_heads`: one row per account with its committed revision counter.
- Private `library_mutation_receipts`: `(owner_id, mutation_id)`, request fingerprint, and accepted result. Replaying an identical mutation returns its original result; reusing its ID with different contents fails.
- Retain tombstones and successful receipts for the personal-library release. Add garbage collection only with an explicit device-expiry/full-resync protocol.
- RLS isolates accounts; initial access additionally honors the current configured personal owner. RPCs derive ownership from `auth.uid()`, never trust an owner supplied in a browser body, and grant browsers no direct mutation access to sync tables. The worker keeps its service credential on the Mac.

### Writes and reads

```ts
type Change = {
  kind: SyncKind;
  entity_id: string;
  base_revision: number | null; // null means this ID must never have existed
  payload: unknown | null;
  deleted: boolean;
};
type PushRequest = {
  protocol_version: 1;
  mutation_id: string;
  changes: Change[];
};
// push_library_changes(request): accepted revisions OR current conflicting records
// pull_library_changes(after_revision, max_revisions): records, next_revision, has_more
```

Implementation rules:

- Serialize mutation commits per owner by locking the owner's head row. Check receipts and every expected revision under that lock, then write the entire group, its receipt, and the incremented head in one transaction. Do not use an unconstrained sequence as a commit-order cursor: a delayed transaction could otherwise be skipped forever.
- Treat unknown IDs, never-created IDs, and retained tombstones distinctly. Validate allowed kinds, schema versions, entity/payload IDs, required shapes, and size limits before mutation. Client Zod validation is additional protection, not a replacement for server checks.
- Start with limits of 100 record changes and 1 MiB serialized payload per group. Reject larger single operations visibly; do not secretly split an action whose atomicity matters. Migration/restore can use resumable bounded groups.
- Pull complete revision groups, never half of a multi-record commit. Select a bounded upper revision and its records from one database snapshot; apply all returned records and advance the local cursor in one IndexedDB transaction. A record updated beyond the page boundary is delivered on a later page.
- Validate incoming payloads before applying them. Unsupported data must stop cursor advancement and produce an actionable update/error state, not silently disappear.
- Freeze a request before its first transmission. After a timeout, retry that exact mutation ID and body.
- Queue dependent local edits in order. A later edit to a still-pending record references its predecessor; once that predecessor is accepted, resolve the later edit's base revision before freezing its request. A conflicting predecessor blocks its dependent edits; it must not be automatically rebased over someone else's change.
- Receipt processing only clears the acknowledged local generation. A newer edit made during a request stays dirty. Incoming remote changes for dirty records go into conflict/shadow storage rather than overwriting local work.
- Use a short renewable IndexedDB lease for one foreground sync runner per account/browser profile; BroadcastChannel wakes other tabs. Correctness must still rely on server idempotency and local transactions if runners overlap.
- Retry transient network/429/5xx failures with bounded exponential backoff and jitter; pause on sign-out, invalid authentication, or hidden/offline state. Persist pending work across reloads and process crashes.

## Task 1: Establish the safe cloud protocol

**Files:** new `supabase/migrations/0006_library_sync.sql` (confirm the next available number first), `supabase/tests/library_sync.sql`, `docs/decisions/0010-account-sync.md`; update `supabase/README.md`.

- [ ] Write SQL regressions for owner/other/anonymous access, same IDs under separate owners, conditional create/update/delete, duplicate delivery, conflicting retries, atomic grouped changes, and pagination at revision boundaries.
- [ ] Implement the tables and the two RPCs above. A request carrying another account's ID must not change the authenticated account boundary. Test security-definer search paths and execution grants explicitly.
- [ ] Add a two-connection concurrency test: hold one owner's commit open while another write arrives; verify the reader never skips either committed change.
- [ ] Run the SQL fixture only against a disposable database. Review the schema/RPC contract before dependent client work. Record the architectural change from device-only storage in the new ADR; preserve the historical meaning of ADR 0008.

**Done when:** a repeated/offline client can safely converge without overwriting a conflicting record or reading another account's library.

## Task 2: Account-scoped local storage and atomic upload queue

**Files:** modify `frontend/src/lib/local/db.ts`, `schema.ts`, `repository.ts`, `imports.ts`, `backup.ts`; create `local/sync-state.ts` and `local/__tests__/sync-state.test.ts`; inspect `LocalApp.tsx`, `LocalImports.tsx`, and `src/app/auth/signout/route.ts`.

- [ ] Introduce an account database selector: `aaf-local:<verified-user-id>`, plus the preserved legacy/guest database. Add `sync_meta`, `sync_outbox`, and `sync_conflicts` stores with a versioned upgrade. Do not put protocol metadata in the existing restricted user-settings enum.
- [ ] Bind every operation and asynchronous response to its account/database generation. Sign-out closes subscriptions and hides that account's data; it does not erase unsynced changes. Another account must not see, export, upload, or adopt those rows. Previously signed-in users can keep working offline; a genuinely new identity requires online verification.
- [ ] Introduce `enqueueSyncGroup(tx, changes)` and call it inside the same read/write transaction as the user mutation. Remote application uses a separate path that never queues an echo upload.
- [ ] Cover `putRecipe`, draft edits and `acceptDraft` first. Preserve draft-without-import restoration and atomically enqueue saved recipe plus draft deletion.
- [ ] Test crash after local commit, failure before commit, edits during upload, overlapping tabs, schema upgrades with another tab open, and A → sign-out → B account isolation.

**Done when:** every recipe/draft edit is either locally committed together with pending synchronization or not committed at all.

## Task 3: Sync runner, recovery, and visible status

**Files:** create `frontend/src/lib/db/librarySync.ts`, `local/sync.ts`, `local/sync-codecs.ts`, `components/app/useLibrarySync.ts`, `components/app/SyncStatus.tsx`, and corresponding tests; modify `components/app/LocalApp.tsx`, `components/settings/DataSettings.tsx`, and the existing navigation component.

- [ ] Implement the typed RPC adapter and validate both transport responses and collection payloads.
- [ ] Implement `syncLibraryOnce()` with the protocol ordering, receipt handling, conflicts, pagination, and account guards above. Pull into shadow state where necessary; never replace the whole local snapshot.
- [ ] Add foreground triggers, debouncing, lease recovery, bounded retries, and manual Sync now. Pause rather than discard work when authentication expires. Authenticate outside Supabase auth callbacks' locked execution path.
- [ ] Implement the four user-facing states and conflict review. Retain both versions until resolution; include unresolved conflicts in a recoverable export.
- [ ] Test an empty new device, offline startup, lost responses, server validation errors, remote changes during an upload, old protocol versions, account switches during in-flight requests, and a pull that stops halfway through pagination.

**Done when:** two independent browser profiles reliably exchange saved recipes, and the UI distinguishes saved locally from uploaded successfully.

## Task 4: Imports available from every device

**Files:** next additive Supabase migration after Task 1; modify `finish_import_job`/`ack_import_job` definitions through that new migration, `frontend/src/lib/local/imports.ts`, `lib/db/parseJobs.ts`, `components/app/useLocalImportSync.ts`, `LocalImports.tsx`; extend SQL, worker, and frontend import tests.

- [ ] Publish the parsed draft into `library_records` inside the same hosted transaction that marks the parse job done. Use the job ID as the draft/recipe ID and preserve warnings. Keep existing worker function arguments compatible where possible.
- [ ] Reuse the same owner revision lock and record validation. An import acknowledgement or source cleanup must never delete the shared draft or saved recipe. Backfill still-present completed results safely; already-cleaned results must come from their surviving device copy.
- [ ] Fetch submitted queue metadata for the signed-in owner even when this device has no local pending job. Keep unsent screenshot bytes on the submitting device. Make clear that an unsubmitted offline request cannot appear elsewhere yet.
- [ ] Receive drafts through library sync. Save performs one conditional recipe-create/update plus draft tombstone group, so a delayed result cannot re-open a saved draft. Concurrent review/save on different devices follows the ordinary conflict rules.
- [ ] Test submit on Mac → worker finish → review on phone; save on phone → recipe on Mac; acknowledgement and cleanup → fresh third-device download still succeeds. Test a blocked source and a restored draft without a local import row.

**Done when:** an import started from any signed-in client can be reviewed elsewhere, and a saved recipe survives temporary queue cleanup.

## Task 5: Planning, shopping, and pantry

**Files:** `local/repository.ts`, `local/sync-codecs.ts`, `lib/meal-plan-schema.ts`, `lib/shopping-schema.ts`, `lib/shopping-logic.ts`, and their tests.

- [ ] Extend outbox coverage to every repository mutation: all meal actions; shopping generation, checking, additions and deletions; pantry changes; completeShopping; and addRecipesToShopping.
- [ ] Serialize individual planned meal occurrences with stable IDs, `week_of`, day, recipe ID, servings, and stable display position; rebuild the existing local weekly view. Persist assigned legacy occurrence IDs once, never regenerate them on each sync. A missing referenced recipe must remain a recoverable dependency, not cause a silent deletion.
- [ ] Persist only canonical shopping fields. Recompute pantry-derived coverage flags locally after pull, so changing a pantry flag does not create upload loops or unnecessary shopping conflicts.
- [ ] For generated shopping replacement, enqueue explicit tombstones for removed rows and writes for replacements in one bounded group. Preserve checked state. If another device changed an affected row, surface the conflict rather than silently clearing it.
- [ ] Keep pantry updates and removal of purchased shopping rows atomic. Test different-day additions, simultaneous serving changes, duplicate pantry names with different IDs, shopping regeneration versus checking, stale deletion resurrection, and completion from two devices.

**Done when:** planning and shopping changes converge without wiping unrelated meals, losing offline edits, or restocking a purchase twice on retry.

## Task 6: Cooking handoff without duplicate completion

**Files:** `local/repository.ts`, `local/schema.ts`, `local/sync-codecs.ts`, `components/cook/CookMode.tsx`; next additive SQL migration and SQL/frontend tests.

- [ ] Synchronize cooking sessions by stable session ID, retaining recipe ID, step, paused time, absolute timer deadline, and completion state. Select/resume a session explicitly; an old session's update cannot overwrite a newly started session.
- [ ] Add a server operation for completing a session exactly once. Key the completion receipt/event by `(owner_id, session_id)` and update the recipe's cooked count atomically. Two devices completing the same session count once; two genuinely different sessions count twice.
- [ ] Keep cooked counts server-controlled during ordinary recipe edits, so uploading an old recipe body cannot reset a newer count. Preserve the initial legacy count separately from new unique completion events. During first migration, review differing legacy counts rather than summing potentially overlapping histories.
- [ ] Synchronize timer state, not per-second ticks or alarm playback. Recompute remaining time locally; avoid automatically sounding an alarm on every connected device. Document clock-skew limitations without using device time to resolve data conflicts.
- [ ] Test handoff mid-step, pause/resume, stale session updates, offline completion retries, two-device completion, and edited recipes arriving after a completion.

**Done when:** cooking can resume elsewhere and retries never inflate or reduce times cooked.

## Task 7: Preserve and enroll existing libraries

**Files:** `local/backup.ts`, `local/migrate.ts`, `components/settings/DataSettings.tsx`, `src/app/api/export/route.ts` as needed, migration/backup tests, and `docs/testing/account-sync.md`.

- [ ] Preserve the original `aaf-local` database, cloud library, and Parquet archives. Export before enrollment; show source counts and account identity. Never assume a cached import owner proves ownership of every legacy row.
- [ ] Copy confirmed data into the account database with resumable, stable-ID batches; queue it for sync. Download existing shared data too. Same ID/same normalized content is a no-op; same ID/different content needs review. Different IDs are preserved even if titles match.
- [ ] Include the manually corrected Niku Miso recipe in the Mac library enrollment. Confirm the phone receives that corrected record, not a newly parsed duplicate.
- [ ] Keep version-1 backups readable. Extend the backup format only for new cooking/conflict data that must survive restore; exclude credentials, cursors, leases, receipts, and pending network request bodies. Restore creates new local sync operations after validation rather than replaying an old device's outbox.
- [ ] While account sync is enabled, offer additive Merge restore; do not reinterpret the existing Replace local library button as permission to delete the cloud account. Retain guest/local-only replacement behavior separately.
- [ ] Verify recipe, plan occurrence, shopping, pantry, draft, and cooking counts plus representative contents before considering enrollment complete. Keep backups until real-device verification passes.

**Done when:** both the existing phone library and the Mac library are preserved, combined safely, and available after signing into a fresh device.

## Task 8: Release in two checkpoints

**Files:** `frontend/e2e/pwa-sync.spec.ts`, `frontend/playwright.pwa.config.ts`, related unit/SQL tests, `docs/testing/account-sync.md`; update `README.md`, `frontend/context.md`, `data/context.md`, `infra/context.md`, and identical `AGENTS.md`/`CLAUDE.md` where scope changes.

- [ ] Checkpoint A: Tasks 1–4 plus recipe/draft enrollment from Task 7. Release automatic recipes and imports first behind an account-sync feature flag. Until later checkpoints are ready, label planning/shopping/pantry/cooking as device-local rather than implying complete synchronization.
- [ ] Checkpoint B: Tasks 5–7 complete. Enable the remaining shared collections and remove the temporary scope labels only after convergence tests pass.
- [ ] Use two independent browser contexts with the same real account, a third context for another/unauthenticated account, and a separate disposable test database for destructive/security cases. Mocked tests remain useful but do not count as the hosted proof.
- [ ] Required scenarios: Mac-created recipe appears on phone; phone import appears on Mac; edit and delete while offline; stale device reconnect; both devices edit one recipe; complete shopping; resume cooking; queue cleanup; restore backup; account switch; app update during pending writes; Mac worker asleep while ordinary recipe synchronization still works.
- [ ] Run the established frontend lint/typecheck/unit/build/PWA checks, backend ruff/mypy/pytest, canonical-document check, and new SQL tests. Inspect hosted migration history and privately back it up; rehearse additive migrations before applying them. PRs go to `dev`, then a green `dev` → `main` release.
- [ ] Verify actual installed iPhone/iPad and desktop behavior at the stable production origin, including airplane-mode cold launch, sign-in redirects, returning to foreground, and preservation of local data across updates. Browser automation alone is insufficient for this gate.
- [ ] Rollback pauses sync and preserves all pending writes and cloud records. Do not roll back by dropping tables or deploying a client that cannot read the upgraded local database. Keep a compatibility build or forward fix available.

## Implementation order and review gates

`Protocol → account storage/outbox → sync runner → shared imports → recipe release → other collections → real-device release`

One owner must coordinate the protocol and local transaction contracts. After those contracts are reviewed, a bounded UI/status task and independent SQL/browser-test tasks can run in parallel. Avoid having several agents edit `repository.ts` or shared schemas simultaneously.

The first visible success criterion is specific: **the corrected Niku Miso recipe saved on the Mac appears automatically on the signed-in iPhone, remains available in airplane mode, and an offline phone edit appears on the Mac after reconnecting.**
