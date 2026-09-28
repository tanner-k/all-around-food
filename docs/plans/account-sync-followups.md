# Account-sync follow-ups after recipe sync is proved

The approved 2026-09-26 release is limited to recipes and new shared import drafts; see the [reduced plan](../superpowers/plans/2026-09-26-recipe-sync-release.md). Do not treat these deferred tasks as shipped.

## Preserved unfinished cooking work

Task6a remains unfinished and unreviewed. Base: `f117c6f51ee6a52e445dd5a86c45a2c4fb80cbf7`. Named stash: **Deferred Task6a cooking history before recipe-only release 2026-09-26**. Immutable stash commit: `015f592032581fc5512e8b00f8e1c50557d9bf55`; retain it, do not drop it. All17 tracked/untracked code files were verified byte-for-byte against their original SHA256 hashes. The archive also retains two ignored scratch documents (19 files total).

Recover in a separate checkout at the recorded base, leaving the recipe release intact:

```sh
git stash apply 015f592032581fc5512e8b00f8e1c50557d9bf55
```

The preserved code includes a historical cooking migration numbered `0008`, protocol2 completion/baseline controls, immutable cooking facts, DBv3/history/session stores and tests. The live fingerprint repair now uses `0008_library_fingerprint.sql`; **renumber the preserved cooking migration to the next available version before restoring it**, and update its references and tests. Do not edit or drop the stash/archive to resolve the collision. Its known failing repository upgrade fixture assumes DBv2; Task6a is not complete. Do not deploy the cooking migration or claim cooking counts/history sync until its remaining implementation and review pass.

Worktree: `/Users/tannerkunz/.codex/worktrees/account-sync/all-around-food`. Ignored durable scratch archive: `.superpowers/sdd/task6a-preserved/{files.tar.gz,tracked.patch,manifest.json,RECOVERY.md}`; additional verified copy: `/private/tmp/aaf-task6a-preserved-20260926`. Ignored design/handoffs remain `.superpowers/sdd/cooking-count-design.md`, `task-6a-report.md`, `task-6b-brief.md`, `task-7a-brief.md`, `task-7b-brief.md`, `task-8-brief.md`; protocol scratch explicitly labels the deferred section. Original broad plan: [2026-09-25 account sync](../superpowers/plans/2026-09-25-account-sync.md).

## Deferred product and integration work

- Finish/review cooking history, session identity, exactly-once counts, operational cook actions/session selection/UI, reviewed legacy baseline and frozen-completion recovery; renumber and rehearse the preserved cooking migration separately.
- Prove planning, shopping, and pantry sync integration before enabling all-stage. Their current local data and deferred outbox groups remain preserved; recipe-stage status reports them separately.
- Design advanced account restore/Replace, source-draft enrollment, whole-library backup/history/conflict restoration, and recovery of unmatched deleted history. Recovery-reference conflict exports are not automatically restorable. Never replay foreign account cursors, revisions, receipts, or frozen requests.
- Prove physical installed iPhone/iPad offline launch, editing, reconnect, auth/account isolation, import-draft Save propagation, and app updates. Use that evidence plus hosted/browser proof before expanding scope.

The initial copy keeps stable recipe IDs (including Niku Miso), titles/content and existing `times_made` aggregates. It does not promise shared cooking history/count changes. Originals, source backups, and old cloud tables remain the recovery source for ignored collections.
