# Jev parsing workflow implementation plan

> **For agentic workers:** Execute using subagent-driven-development, with focused tests and final integration review.

**Goal:** Use the tested Jev ingredient phrase workflow for recipe imports, without Anthropic in the import pipeline.

**Architecture:** Local source acquisition and CPU transcription feed a bounded Jev classifier. Source spans supply ingredient names, exact amounts, alternatives and cooking instructions. The existing recipe draft and lease-fenced worker remain the delivery contract.

**Tech Stack:** Python 3.12, httpx, Pydantic, whisper.cpp, Tesseract, Jev Choice/Noul.

**Global Constraints:** Preserve source evidence; never infer missing amounts or sum alternatives. Process captions as well as transcripts. Retain URL fetch protections. No deployment, hosted migration, private key logging, or changes to unrelated work.

1. Promote exact quantity and phrase grouping helpers; regress fractions, ranges, alternatives and contradictory relationships.
2. Add a pinned, validated Jev client with request, input and time budgets. Configure credentials through Settings.
3. Implement independent sentence labels, token roles, quantity/unit linking, phrase validation and conservative draft assembly; preserve uncertainty and originals.
4. Route website, pasted text, video and locally OCR'd screenshots through Jev. Forward warnings to draft review. Use small.en CPU transcription with caption context.
5. Update setup documentation and container dependencies. Run focused and full backend checks, review integration, and smoke-test saved development recipes without touching the live queue.

**Validation:** Mock external services in CI; use meaningful source-to-draft regressions. Keep saved development smoke outputs separate from held-out examples. Record results and operational limitations at completion.

## Outcome

All five implementation steps are complete. See [validation and remaining rollout checks](../../testing/jev-parsing-workflow.md). The development workflow is implemented; activation of the actual worker and a live queue import remain operational follow-up.
