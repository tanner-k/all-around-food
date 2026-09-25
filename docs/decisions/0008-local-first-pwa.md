# 0008 — Local-first PWA with a Mac Mini import worker

**Status:** Proposed
**Date:** 2026-09-19
**Supersedes:** ADR 0007's cloud-system-of-record decision and the unimplemented July native-iOS design for the first release.

## Context

The user wants a personal app installed from a website, with saved data on-device, before App Store distribution or inviting others. Online recipe processing is acceptable. The web app has reusable screens/domain logic and a Python import worker. The user prefers their Mac Mini over paid worker hosting initially.

## Decision

Keep Next.js/React and ship a PWA. Use an offline-cacheable `/app` shell with hash navigation, IndexedDB as the source of truth, and versioned backup/restore. Reuse schemas/components and copy existing Supabase data non-destructively.

Retain Supabase for private import authentication, temporary media/jobs/results, and the initial read-only export. The Mac Mini runs the recipe worker under launchd with the Anthropic key in its environment. Results become local drafts; explicit Save adds a recipe to the local cookbook. Acknowledgement follows a durable local transaction. The worker retries cleanup and expires abandoned imports while running.

Railway, native mobile builds, billing, BYOK, cloud library synchronization, pricing and receipt OCR are outside this milestone. The July native plan remains historical context, not execution guidance.

## Consequences

- Everyday use works offline without sign-in or the worker.
- The existing UI, extraction pipeline and queue/auth can be reused.
- Browser data is tied to an origin/device and can be cleared; backup is part of the first release.
- Imports wait while the Mac is unavailable. A LaunchAgent requires the Mac user to be logged in.
- Import content passes through online services; local storage does not imply on-device AI processing.
- Cross-device synchronization is deferred; backup files support manual transfer.
- Hosted processing remains an operational follow-up, not a prerequisite.

## Implementation

See [the implementation plan](../superpowers/plans/2026-09-19-local-first-pwa.md). Acceptance is install → import → review → local save → offline reopen/cook → plan → shopping, with verified migration and backup restore.

This ADR records the proposed execution of the agreed direction. It does not assert implementation or deployment changes.
