# Recipe-only account sync release — 2026-09-26

Approved by the user: finish recipes/imports on Mac and iPhone, including offline edits/deletions and preserved conflict versions; record expanded work for after online/offline sync is proved. This narrows the original [account-sync plan](2026-09-25-account-sync.md) Tasks6–8. Reviewed Tasks1–5 at f117c6f remain the base.

1. Preserve unfinished cooking work using a named immutable stash and hash-verified archive; withdraw it from the release candidate. Recovery and deferred scope: [account-sync follow-ups](../../plans/account-sync-followups.md).
2. Add explicit Settings recipe review/copy into the captured signed-in account from original device library, v1 backup, or server-owner-bound legacy cloud export. Validate recipes independently of ignored references, preserve raw source backup and originals, show same-ID differences, default to account version, retain different IDs. Download source/account backups and confirm before writes. Reject changed destination previews. Commit each recipe with bounded create/update intent; reruns are idempotent. Source drafts and all other collections remain outside copy.
3. Use stage recipes for Vercel candidate builds. Keep plan/shopping/pantry/cooking device-only, advanced account restore disabled, and conflict export labelled as a recovery reference. Stage off is the rollback and preserves queues.
4. Run focused copy/UI/owner-binding tests, then frontend full tests, typecheck/lint and production/PWA verification. Rehearse migrations0001–0007 in a disposable database; do not apply deferred0008. Complete independent scoped and full-branch review.
5. Back up and inspect actual hosted migration history, then apply only reviewed0006/0007. Verify two independent authenticated browser contexts for creation, offline edit/reconnect, deletion/conflict, import-draft Save, and account isolation. PR to dev, green CI, release to main at the stable origin. No worker reinstall.
6. Record the installed iPhone/iPad offline/update test as pending until the user confirms it on the physical device. Browser simulations are separate evidence.

Acceptance: same signed-in cookbook and completed imports on each device; offline changes later sync; conflicting versions survive; existing recipes can be deliberately copied. Expanded cooking/history/recovery and all-stage remain deferred.
