# Jev parsing workflow validation — 2026-09-25

The worker now routes website, video, pasted-text and screenshot imports through Jev. Screenshot text comes from local Tesseract; videos default to CPU `small.en` with bounded caption context. Neither imports nor their completion path invoke Anthropic. Drafts retain original source text and review warnings.

## Verified

- Backend: 592 passed, 2 skipped, 4 deselected with `pytest -m 'not network and not slow'`. The excluded checks exercise unrelated external/network or model-download dependencies.
- Ruff passes; strict mypy passes across 72 source files.
- Native Mac worker setup tests: 7 passed. Canonical agent instructions match; whitespace checks pass.
- Real Jev calls used the existing private key and saved `small.en` development transcripts/captions. No video redownload, held-out example, live queue, hosted migration, deployment or worker restart was involved.

| Saved development example | Result | Key observation |
| --- | --- | --- |
| Japanese cold beef udon (`Dbl0tRCvSNM`) | 21 ingredient entries, 25 steps | Preserves separate 92 g, 300 g and 100 g water amounts; retains the caption's rinse step. Some unmeasured aliases/intermediates still need review. |
| Korean spicy pork (`DcW94vtBNM5`) | 15 ingredient entries, 8 steps | Reads inline Meat Marinade/Veggies ingredient lists and caption-only quantities. Mirin is flagged for review; generic “veggies” remains an extra candidate. |
| Golden/red potato control | 1 ingredient entry, 1 step | Keeps “golden or red potatoes” as one requirement and preserves “24 oz” as written. The normalized amount is withheld because classification is uncertain. |

These are development checks, not a held-out accuracy score. One earlier smoke call rejected an invalid Jev choice response; subsequent runs succeeded. Invalid responses remain visible failures rather than silently accepted data.

## Remaining operational checks

The code is not activated on the Mac Mini. Restart/rebuild the worker from the updated checkout with `TYPESAFE_API_KEY`, `WHISPER_MODEL=small.en`, and the model file available. Screenshot imports require Tesseract (`brew install tesseract` for native macOS); it is included in the updated Dockerfile. Tesseract is not installed in this verification environment, and the container build/live queue path was not exercised.

Remaining extraction limitations include cross-sentence aliases, prepared intermediates mistaken for separate ingredients, ambiguous quantities and competing caption/transcript instruction lists. Original sources and warnings stay with the draft for manual correction; no missing amount is invented.

See [the implementation plan](../superpowers/plans/2026-09-25-jev-parsing-workflow.md), [ADR 0009](../decisions/0009-jev-recipe-parsing.md), and [worker setup](../../infra/worker/README.md).
