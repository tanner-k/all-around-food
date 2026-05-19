# Recipe Parse Evaluation Pipeline

**Last Updated:** 2026-05-19

## Purpose

Parsing recipes from screenshots and URLs is open-ended: there is no ground truth to compare against, and the quality of extraction varies widely depending on image clarity, source structure, and recipe completeness. To measure and iterate on parse quality empirically, **every recipe parse is graded by a stronger model (Claude Sonnet) using a structured evaluation schema**.

The judge model rates the parser's output on three independent dimensions:
- **Overall Grade** (0–10) — holistic quality
- **Accuracy Grade** (0–10) — correctness of populated fields
- **Completeness Grade** (0–10) — how much available information was captured

This gives quantitative signal for:
- Deciding whether `claude-haiku-4-5` is sufficient or if we need to upgrade the worker model
- Iterating on the parse prompt with data-driven insight
- Tracking improvements over time as the system matures

## Architecture

```
[Browser]
    │
    ├─ User drops screenshot or pastes URL
    │
    ▼
[Next.js /api/import/parse]  ← POST with image or URL
    │
    ├─ (1) Call Claude Haiku 4.5 with vision or text
    ├─     Extract structured Recipe JSON
    ├─     Capture: prompt, model, output, confidence
    │
    ├─ (2) Return Recipe to browser immediately
    │       ✓ User save flow completes (non-blocking)
    │
    └─ (3) Fire-and-forget Promise (in background):
         │
         ├─ Call Claude Sonnet 4.6 (judge)
         ├─ Grade overall/accuracy/completeness
         ├─ Capture strengths, weaknesses, field issues
         │
         └─ POST /evaluations to FastAPI backend
              │
              └─ EvalStore saves to data/evaluations.parquet

Why fire-and-forget?
- User's save flow NEVER blocks on grading.
- Grading failures (network, API error) do NOT propagate to the UI.
- Evals are purely observational — missing an eval doesn't break the app.
```

## The Recipe Schema as Contract

Both the **parser (worker)** and **grader (judge)** operate against a shared structured schema. This is critical because:

1. **Parser knows exactly what to extract** — the schema defines every required and optional field.
2. **Judge knows exactly what to look for** — it can grade field-by-field completeness independently from accuracy.
3. **Absent vs. Forgotten** — by requiring `null` / `[]` for unknowns (never omitting keys), the judge can distinguish "the source didn't have nutrition info" from "the parser forgot to look for it".

### Recipe Schema Fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` | UUID, assigned by frontend at save time |
| `title` | `string` | Recipe name (required) |
| `description` | `string \| null` | Short blurb or summary |
| `source_url` | `string \| null` | URL where recipe was found |
| `source_attribution` | `string \| null` | Credit line (e.g. "NYT Cooking — Melissa Clark") |
| `prep_time_min` | `int \| null` | Prep time in minutes |
| `cook_time_min` | `int \| null` | Cook time in minutes |
| `total_time_min` | `int \| null` | Total time in minutes |
| `servings` | `int \| null` | Number of servings |
| `yield_text` | `string \| null` | Text yield description (e.g. "Makes 12 cookies") |
| `ingredients` | `Ingredient[]` | List of ingredients (≥1 required) |
| `steps` | `Step[]` | List of cooking steps (≥1 required) |
| `equipment` | `string[]` | List of equipment names (e.g. "12-inch skillet") |
| `cuisine` | `string \| null` | Cuisine type (e.g. "Italian", "Thai") |
| `course` | `string \| null` | Course type (e.g. "Dinner", "Dessert") |
| `dietary_tags` | `string[]` | Tags (e.g. "vegetarian", "gluten-free") |
| `difficulty` | `"easy" \| "medium" \| "hard" \| null` | Difficulty level |
| `nutrition` | `NutritionPerServing \| null` | Per-serving nutrition facts |
| `notes` | `string \| null` | Author notes, tips, or variations |
| `storage_instructions` | `string \| null` | How to store leftovers |
| `created_at` | `datetime` | ISO 8601 timestamp of parse time |
| `times_made` | `int` | Times this recipe has been cooked (default 0) |
| `parse_confidence` | `float (0–1) \| null` | Parser's self-rated confidence |

### Ingredient Schema Fields

| Field | Type | Purpose |
|-------|------|---------|
| `name` | `string` | Ingredient name (e.g. "all-purpose flour") |
| `quantity` | `Quantity` | Structured amount (see below) |
| `preparation` | `string \| null` | Prep instruction (e.g. "finely chopped") |
| `optional` | `bool` | Whether the ingredient is optional |
| `group` | `string \| null` | Grouping label (e.g. "For the sauce") |
| `notes` | `string \| null` | Parenthetical notes or substitutions |

### Quantity Schema Fields

| Field | Type | Purpose |
|-------|------|---------|
| `value` | `float \| null` | Numeric amount (e.g. 1.5) |
| `unit` | `string \| null` | Unit of measurement (e.g. "cup", "tbsp", "g") |
| `as_written` | `string` | Raw substring from source (e.g. "1½ cups") |

The `as_written` field is **critical for grading**: the judge compares it against the structured `value`/`unit` to detect hallucinations.

### Step Schema Fields

| Field | Type | Purpose |
|-------|------|---------|
| `order` | `int` | Step number (1-indexed) |
| `instruction` | `string` | The directive text |
| `duration_min` | `float \| null` | Duration in minutes (e.g. "cook for 5 minutes" → 5.0) |
| `temperature_f` | `int \| null` | Temperature in Fahrenheit (converted from Celsius if needed) |
| `equipment` | `string[]` | Equipment used in this step |
| `inline_amounts` | `string[]` | Names of ingredients referenced in this step |

The `inline_amounts` field powers the UI's inline-pill treatment (e.g. "whisk the [flour]") and gives the judge a consistency check.

### Nutrition Schema Fields

| Field | Type | Purpose |
|-------|------|---------|
| `kcal` | `int \| null` | Kilocalories per serving |
| `protein_g` | `float \| null` | Grams of protein |
| `carbs_g` | `float \| null` | Grams of carbohydrates |
| `fat_g` | `float \| null` | Grams of fat |
| `fiber_g` | `float \| null` | Grams of dietary fiber |
| `sugar_g` | `float \| null` | Grams of sugar |
| `sodium_mg` | `float \| null` | Milligrams of sodium |

## The Evaluation Schema (Field-by-Field)

Every parse triggers an evaluation record in `data/evaluations.parquet`. Here is what each field captures:

### Context Fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` | UUID of the evaluation record |
| `created_at` | `datetime` | ISO 8601 timestamp when eval was created |
| `source_kind` | `"image" \| "url"` | Whether source was a screenshot or web URL |
| `source_ref` | `string` | For images: sha256 hash of image bytes; for URLs: the URL itself |

### Worker (Parser) Fields

| Field | Type | Purpose |
|-------|------|---------|
| `worker_model` | `string` | Model name (e.g. "claude-haiku-4-5") |
| `worker_prompt` | `string` | Full system + user prompt sent to the parser |
| `worker_output` | `string` | JSON-stringified Recipe that the parser produced |
| `worker_parse_confidence` | `float (0–1) \| null` | Parser's self-rated confidence on the parse |

**Note:** `worker_prompt` and `worker_output` may contain recipe text the user uploaded. However, `source_ref` for images is only a hash, never the raw image bytes.

### Judge (Grader) Fields

| Field | Type | Purpose |
|-------|------|---------|
| `judge_model` | `string` | Model name (e.g. "claude-sonnet-4-6") |
| `judge_prompt` | `string` | Full system + user prompt sent to the judge |

### Grade Fields

| Field | Type | Purpose |
|-------|------|---------|
| `overall_grade` | `int (0–10)` | Holistic quality score |
| `accuracy_grade` | `int (0–10)` | Correctness of populated fields |
| `completeness_grade` | `int (0–10)` | How much available info was captured |

These three grades are scored independently so you can see **where** the parser struggles:
- Low accuracy but high completeness → parser is thorough but sometimes incorrect
- High accuracy but low completeness → parser is conservative; misses data

### Feedback Fields

| Field | Type | Purpose |
|-------|------|---------|
| `strengths` | `string[]` | List of things the parser did well |
| `weaknesses` | `string[]` | List of recurring issues |
| `field_checks` | `JudgeFieldCheck[]` | Per-field assessment (see below) |
| `reasoning` | `string` | Narrative explanation of the grades |
| `suggested_prompt_improvements` | `string \| null` | If the judge spots a fixable pattern, one concrete sentence to add to the parser prompt |
| `raw_judge_output` | `string` | Full JSON from the judge's tool call (for debugging) |

### JudgeFieldCheck Schema

Each field check is a structured assessment of a single Recipe field:

| Field | Type | Values |
|-------|------|--------|
| `field` | `string` | Dotted path (e.g. "ingredients[3].quantity.unit", "nutrition.kcal") |
| `issue` | `enum` | `"missing"` \| `"incorrect"` \| `"hallucinated"` \| `"fine"` |
| `detail` | `string` | Specific note (e.g. "source shows 2 tsp salt, parser extracted 1 tsp") |

## The Grading Prompt

This is the exact system prompt sent to Claude Sonnet when it grades a parse. The judge uses this schema-aware evaluation strategy:

```
You are an expert culinary editor evaluating an automated recipe-parsing system.

The parser was asked to extract a recipe into this exact structured schema:

{recipeJsonSchema}

You will receive (1) the source the parser saw (URL+text or image) and (2) the structured Recipe JSON the parser produced.

Grade three dimensions independently on a 0-10 scale:

  overall_grade       — holistic quality.
  accuracy_grade      — are the populated fields correct? Compare structured value/unit against `as_written` strings; flag hallucinations.
  completeness_grade  — did the parser populate every field the source actually contained? A null is correct only if the source genuinely lacked that info. Penalize missing nutrition, timing, equipment, etc. when the source provided them.

For each issue, add a JudgeFieldCheck with the exact dotted path (e.g. "ingredients[3].quantity.unit" or "nutrition.kcal") and one of: missing | incorrect | hallucinated | fine.

If you spot a recurring pattern (parser consistently drops X-type info), populate suggested_prompt_improvements with one concrete sentence to add to the parser prompt.

Return ONLY the tool call — no prose.
```

Note that the judge has access to:
- The full Recipe schema (JSON Schema format)
- The original source (image or text)
- The parser's structured output
- Freedom to inspect field-by-field (via `field_checks` and `JudgeFieldCheck`)

This enables honest completeness grading: the judge can see what data the source *actually contained* and compare it to what the parser captured.

## Reading the Dashboard

Visit http://localhost:3000/evaluations (dev-only page, not linked from nav) to see evaluation data:

### Stats Strip

Four key numbers across the top:

- **Count** — Total evaluations recorded so far
- **Mean Overall** — Average `overall_grade` across all evals
- **Mean Accuracy** — Average `accuracy_grade` across all evals
- **Mean Completeness** — Average `completeness_grade` across all evals

### Evaluation Table

Columns:

| Column | Content |
|--------|---------|
| **Created** | ISO timestamp of the eval |
| **Source** | Icon + "image" or "url" |
| **Ref** | Truncated source_ref (hash for images, URL for URLs) |
| **Overall** | Grade 0–10 with color chip |
| **Accuracy** | Grade 0–10 with color chip |
| **Completeness** | Grade 0–10 with color chip |
| **Expand** | Chevron to show details |

### Grade Chip Colors

Colors indicate performance:

- **≥8 (Forest/Green)** — Excellent; parser nailed it
- **4–7 (Warn/Amber)** — OK but room for improvement
- **<4 (Terra/Red)** — Poor; significant issues to address

### Expandable Row Details

Click the chevron to reveal:

- **Strengths** — Bulleted list of what the parser did well
- **Weaknesses** — Bulleted list of recurring issues
- **Field Checks** — Detailed per-field assessment (field path, issue type, specific detail)
- **Reasoning** — Narrative explanation of the grades
- **Suggested Prompt Improvements** — If the judge recommends a prompt change, shown here

## Using Eval Data to Iterate on the Parse Prompt

### Workflow

1. **Sort by completeness ascending** — Find the evals where the parser missed the most data.
   - Look for recurring weakness themes (e.g. "consistently missed nutrition info" or "skipped equipment list").

2. **Check suggested_prompt_improvements** — The judge may have already suggested a fix.
   - Example: "Add explicit instruction to scan the entire image for nutrition tables in the footer."

3. **Update the worker system prompt** in `frontend/src/lib/claude.ts` (`WORKER_SYSTEM_BASE`).
   - Add a new rule that targets the weakness.
   - Keep the rule concrete and specific.

4. **Re-run a sample of historical sources** — Re-parse some of the low-completeness recipes.
   - The backend is stateless; you can re-submit the same URL or image via the `/import` flow.
   - Observe whether the new eval has a higher `completeness_grade`.

5. **Track the trend** — Over time, `curl localhost:8000/evaluations/stats` should show climbing mean grades.

### Example Iteration

**Observation:** Sorted evals by completeness; see that nutrition data is consistently missing (grade ~4/10).

**Judge's suggestion:** "Add instruction: 'Always check the footer of the image for nutrition tables.'"

**Action:** Edit `WORKER_SYSTEM_BASE` to add:
```
9. Nutrition tables often appear at the bottom of recipe pages or images. Scan the entire height.
```

**Retest:** Re-parse 3 recipes that previously scored low on completeness. Check new evals; if nutrition_grade climbs, iteration succeeded.

## Retention & Privacy

### What Is Stored

- **worker_prompt** — The full system+user prompt sent to Haiku (may contain recipe text the user uploaded)
- **worker_output** — The structured Recipe JSON produced by Haiku (may contain recipe text)
- **source_ref** — For images: SHA256 hash of image bytes (NOT the raw image); for URLs: the URL string
- **judge_prompt** — Full prompt sent to Sonnet (includes recipe JSON + judge instructions)
- **raw_judge_output** — Judge's verdict as JSON (no raw image data, just structured grades)

### PII Considerations

- Images are **hashed** (SHA256), never stored as raw bytes.
- Recipe text from user uploads is stored in `worker_output` (structured JSON form) and `worker_prompt`. If a user uploads a private family recipe, that text is in the parquet.
- The dashboard (`/evaluations`) is dev-only and not linked from the main nav — access requires direct URL knowledge.
- No retention policy yet — data persists indefinitely in `data/evaluations.parquet`.

### Manual Cleanup

To reset evaluation data:
```bash
rm data/evaluations.parquet
# Restart the backend — it will create an empty parquet on next eval POST.
```

## Cost Notes

Each parse triggers approximately **2 Claude API calls**:

1. **Worker (Haiku)** — Vision or text parsing (typically 0.5–2 sec, ~0.5–1 KB output)
2. **Judge (Sonnet)** — Grading the parse (typically 2–5 sec, ~1–2 KB output)

### Prompt Caching

Both calls use `cache_control: { type: "ephemeral" }` on the system block:

- The **worker** system prompt includes the full JSON schema (constant; ~4 KB).
- The **judge** system prompt includes the full JSON schema (constant; ~4 KB).
- Subsequent calls within 5 minutes hit the cache, reducing tokens.

This follows the `claude-api` skill conventions for cost-efficient repeated calls.

### Estimated Cost

At typical rates:
- Haiku: ~2¢ per 1M input tokens (cached → ~0.3¢ per 1M cached tokens)
- Sonnet: ~3¢ per 1M input tokens (cached → ~0.9¢ per 1M cached tokens)

Each parse + eval is roughly **$0.001–0.002** (1–2 cents) after cache benefits.

## Related Documentation

- **Recipe Import Flow:** `/frontend/src/app/(app)/import/` — UI for capturing the source
- **Parse API:** `/frontend/src/app/api/import/parse/` — Entry point for worker + fire-and-forget judge
- **Backend Evaluation Endpoints:** `/backend/src/allaroundfood/api.py` — `POST /evaluations`, `GET /evaluations`, `GET /evaluations/stats`
- **Worker Prompt:** `/frontend/src/lib/claude.ts` `WORKER_SYSTEM_BASE` — Customize here to improve completeness
- **Judge Implementation:** `/frontend/src/lib/claude.ts` `gradeRecipeParse()` — Calls Sonnet with structured schema
