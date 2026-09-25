# Jev recipe classification experiment

## Scope

This is an isolated text-grouping and labeling experiment, not a replacement activated in the app. It uses yt-dlp, CPU Whisper, and Jev; it makes no Anthropic or Supabase calls. The existing deployed parser has not been switched. The user's revised direction is to remove Anthropic from the entire future pipeline, including screenshot vision; the September 24 pipeline plan's Anthropic tasks are superseded and must not be executed as written.

## Live sample and observed results

Source: https://www.instagram.com/therealchadli/reel/DboNc-8CTox/

| Measurement | Observed September 24, 2026 |
|---|---|
| Extraction | yt-dlp 2026.08.19 downloaded media and caption without cookies |
| Audio duration | 28.68 seconds |
| Source text | 1,554 caption characters; 169 transcript characters |
| CPU settings | Whisper base.en, four threads, explicit `use_gpu=False`; runtime reported CPU/BLAS backend |
| Extraction time | 5.98 seconds |
| Transcription including first model download/loading | 11.31 seconds; native Mac run, not a Linux-container benchmark |
| Jev model returned | jev-1.13.0 |
| Jev grouping | One adjacent-pair question, 0.758 seconds |
| Jev classification | 31 block questions, 0.358 seconds |
| Total Jev usage | Two requests; 6,805 input tokens and 1,984 output tokens |
| Block labels | 17 ingredient, 5 cooking step, 5 heading, 3 note, 1 irrelevant |

This caption already contains explicit ingredient lines and numbered directions. The prototype preserves those boundaries in code, so only the two transcript fragments required a Jev grouping decision. This is useful evidence for classification, but weak evidence for recovering structure from a long spoken recipe.

Qualitative review found the ingredient entries and five substantive cooking steps sensibly labeled. The final “Enjoy!” line was a note with confidence 0.35; the spoken introduction was irrelevant with confidence 0.66. Both appear under the review filter. The price comparison was retained as a note, which can be changed through rubric refinement if the intended product should exclude it.

The ingredient count is a count of text blocks, not individual ingredients: a single caption line lists several spices. Amount extraction, ingredient splitting, serving scaling, step linking, and deduplication between caption/transcript have not been implemented here. Whisper rendered the food name “naan” as “knife” in the introduction; Jev deliberately preserves the supplied text rather than correcting it. Audio transcription completeness was not independently scored.

## Implementation and safeguards

- `backend/src/allaroundfood/parsing/jev_prototype.py`: deterministic source spans, bounded adjacent-pair Noul questions, conservative merging, and batched Choice classification through existing HTTPX.
- `backend/scripts/try_jev_recipe.py` and `jev_review.html`: read a text-source JSON file and private environment file; write `results.json` and a standalone interactive review page. Source text is escaped and rendered with `textContent`.
- `backend/src/allaroundfood/transcription.py`: optional `cpu_only=True` for an explicit CPU benchmark. The existing default is unchanged.
- Input cap: 20,000 characters. Batch cap: 32 questions. Maximum 12 calls. No automatic retries or hidden model fallback. Long input fails explicitly rather than being silently truncated.
- No joins across sources, explicit lists, or blank paragraphs. Proposed merge cutoff is 0.7; maximum merged block is 600 characters/four segments. These are provisional controls, not calibrated recipe-specific thresholds.
- Original text, source spans, join probabilities, actual join decisions, block labels, confidence, model version, and usage are recorded. All blocks remain reviewable, including irrelevant/mixed text.
- Validate complete response keys and finite probabilities before using model decisions. Do not log the API key, request headers, or raw provider error bodies.

## Reproduce the Jev run

Use the Python 3.12 backend environment with its existing dependencies. Create a UTF-8 JSON file mapping source names to text, for example:

```json
{"caption":"Ingredients:\n- 2 eggs\nMethod:\n1. Whisk the eggs.","transcript":"Whisk the eggs. Then cook them gently."}
```

From `backend/`, with `TYPESAFE_API_KEY` set in the selected private `.env`:

```sh
PYTHONPATH=src .venv/bin/python scripts/try_jev_recipe.py \
  --input /private/tmp/recipe-sources.json \
  --env-file /Users/tannerkunz/coding/all-around-food/backend/.env \
  --output /private/tmp/jev-review
```

The implementation worktree currently uses the main checkout's backend virtualenv. Substitute that Python path when the worktree has no `.venv`. Do not commit the private `.env`, media/model files, or API credentials. Each invocation performs a new bounded paid Jev run; inspect the existing JSON/HTML to review results without calling the API again.

For new reel sources, reuse `fetch_video_text` in `video_import.py` with `WhisperCppTranscriber(cpu_only=True, models_dir=...)`, serialize its `caption` and `transcript`, and keep model downloads outside the repo. The initial source extraction in this experiment used the same download/audio helpers and wrapper, with intermediate caption storage before transcription.

## Verification

- 13 focused tests passed: eight prototype tests and five transcription-wrapper tests. Prototype API tests are mocked; the live sample above is separate evidence.
- Scoped Ruff and mypy passed.
- Browser verification of the real result: 31 total blocks, one transcript block after source filtering, two blocks under “Needs review only.”
- No live queue rows or saved recipes were altered.

## Next experiment

Use a narration-heavy cooking clip, plus a small hand-labeled set of captions/transcripts with explicit expected ingredient/step boundaries. Evaluate classification and grouping separately. Review mixed blocks, decimal quantities, sentence abbreviations, missing punctuation, headings, and unrelated speech. Keep thresholds and rubrics versioned; do not infer accuracy from confidence alone. Revise the production plan only after this behavior is accepted. Screenshots will need a separate text-extraction/OCR solution without Anthropic.

References: [TypeSafe primitives](https://docs.typesafe.ai/primitives), [structure recovery](https://docs.typesafe.ai/cookbooks/autoformat), and [API reference](https://docs.typesafe.ai/api).
