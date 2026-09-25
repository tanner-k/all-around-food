# 0009 — Source-grounded Jev recipe parsing

**Status:** Accepted
**Rollout:** Implementation only; deployment unverified
**Date:** 2026-09-25
**Supersedes:** Anthropic recipe extraction in ADRs 0002, 0007 and 0008.

Recipe imports use the pinned `jev-1.13.0` classifier. Local website extraction, screenshot OCR (Tesseract), and CPU whisper.cpp `small.en` transcription produce text. Captions provide bounded transcription context and are independently parsed as recipe sources.

The parser labels ingredients and cooking steps independently, classifies ingredient tokens, links exact locally parsed amounts and units, and validates ingredient phrase relationships. Modifiers, aliases and alternatives remain source-backed. Unknown, ranged, approximate or conflicting amounts are not manufactured into precise shopping quantities. Original source text and warnings remain in recipe notes; detailed decision evidence is available to diagnostic callers.

The worker retains its existing claim-token fencing and draft publication. Jev credentials stay on the worker in `TYPESAFE_API_KEY`; no browser key or Anthropic import call is required. Legacy judge tooling remains separately callable for historical tests, outside imports even when `RUN_EVALS` is true.

Source size, token, question, request and elapsed-time limits stop oversized jobs with a visible error. Existing website destination checks remain. The development corpus supports regression testing, not a held-out accuracy claim. Instagram acquisition can still fail independently of parsing.

API contract: [TypeSafe Noul](https://docs.typesafe.ai/primitives/noul) and [Choice](https://docs.typesafe.ai/primitives/choice). Question instructions explicitly identify their target source item because question IDs alone are not model context.
