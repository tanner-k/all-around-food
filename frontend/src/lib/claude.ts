import "server-only";

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { RecipeSchema, recipeJsonSchema, type Recipe } from "./recipe-schema";
import {
  JudgeVerdictSchema,
  judgeVerdictJsonSchema,
  type JudgeVerdict,
} from "./eval-schema";
import {
  ReceiptParseSchema,
  receiptParseJsonSchema,
  type ReceiptParse,
} from "./shopping-schema";

// ── Lazy singleton client ─────────────────────────────────────────────────────
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    // Project-specific name so it never collides with a global ANTHROPIC_API_KEY
    // exported in the user's shell (which would override .env.local in Next.js).
    const key = process.env.ANTHROPIC_API_KEY_PARSING;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY_PARSING is not set. Add it to frontend/.env.local and RESTART the dev server (Next.js loads .env at startup, not on edit)."
      );
    }
    // Safe diagnostic: fingerprint, never the key itself. Compare against
    //   printf '%s' "$(grep ^ANTHROPIC_API_KEY_PARSING frontend/.env.local | cut -d= -f2)" | shasum -a 256
    const fp = createHash("sha256").update(key).digest("hex").slice(0, 8);
    console.log(
      `[claude] ANTHROPIC_API_KEY_PARSING in use: len=${key.length} fp=${fp}`
    );
    _client = new Anthropic({
      apiKey: key,
      // Retry on 408/409/429/5xx with exponential backoff.
      // Default is 2; bumping to 4 to ride out transient 502s from Cloudflare.
      maxRetries: 4,
    });
  }
  return _client;
}

// ── Shared system prompt for the worker ──────────────────────────────────────
const WORKER_SYSTEM_BASE = `You are an expert recipe parser. Extract the recipe shown in this image into the exact structured schema provided by the \`extract_recipe\` tool.

CRITICAL RULES:
1. NEVER omit a key. Use \`null\` for unknown scalars and \`[]\` for unknown lists. Every key in the schema must appear in your output.
2. The image may contain a title, ingredients, instructions, nutrition info, and notes spread anywhere — TOP to BOTTOM. Scan the entire image.
3. For each Quantity, ALWAYS populate \`as_written\` with the raw substring you saw (e.g. "1½ cups"), even if you also produce structured \`value\`/\`unit\`.
4. For each Step, populate \`inline_amounts\` with the names of ingredients referenced — this drives the inline-amount display.
5. Convert temperatures to Fahrenheit (temperature_f). If only Celsius given, convert.
6. \`id\` should be left as empty string "" — the application will assign a UUID at save time. \`created_at\` should be the current ISO datetime.
7. Self-rate your parse on a 0.0–1.0 scale in \`parse_confidence\`. Be honest: if the image is blurry or partial, rate lower.`;

const WORKER_SYSTEM_URL_EXTRA = `
2. The text was extracted from a webpage. Look for ingredient lists, step lists, nutrition tables.`;

// ── Worker tool definition ────────────────────────────────────────────────────
const workerTool: Anthropic.Tool = {
  name: "extract_recipe",
  description: "Extract the full recipe into structured JSON",
  input_schema: recipeJsonSchema as Anthropic.Tool["input_schema"],
};

// ── Judge tool definition ─────────────────────────────────────────────────────
const judgeTool: Anthropic.Tool = {
  name: "submit_verdict",
  description: "Submit a graded verdict for the parse quality evaluation",
  input_schema: judgeVerdictJsonSchema as Anthropic.Tool["input_schema"],
};

// ── Receipt tool definition ───────────────────────────────────────────────────
const receiptTool: Anthropic.Tool = {
  name: "extract_receipt",
  description: "Extract grocery line items from a receipt image",
  input_schema: receiptParseJsonSchema as Anthropic.Tool["input_schema"],
};

const RECEIPT_SYSTEM_BASE = `You are an expert at reading grocery store receipts. Extract every purchasable food and grocery item into the exact structured schema provided by the \`extract_receipt\` tool.

CRITICAL RULES:
1. NEVER omit a key. Use \`null\` for unknown scalars. Every key in the schema must appear in your output.
2. Include only purchasable products. SKIP subtotals, tax, totals, change, tender/payment lines, loyalty/savings/coupon lines, store address, phone numbers, dates, and cashier info.
3. Receipts use cryptic register abbreviations. Expand them to a normal grocery name when you are confident (e.g. "GV WHP MILK" → "whole milk", "BNLS CHKN BRST" → "chicken breast"). If unsure, keep the printed text.
4. Put any printed quantity/weight/count token in \`quantity_text\` (e.g. "2 @ $1.99", "1.34 lb"); otherwise use null.
5. Set \`store\` to the store name if visible, else null.
6. Self-rate your parse on a 0.0–1.0 scale in \`parse_confidence\`. Be honest: faded, partial, or blurry receipts should rate lower.`;

// ── sha256Hex ─────────────────────────────────────────────────────────────────
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── parseRecipeFromImage ──────────────────────────────────────────────────────
export async function parseRecipeFromImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<{ recipe: Recipe; workerPrompt: string }> {
  const client = getClient();

  const systemText = WORKER_SYSTEM_BASE;

  const userContent: Anthropic.MessageParam["content"] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: base64,
      },
    },
    {
      type: "text",
      text: "Extract the recipe from this image.",
    },
  ];

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [workerTool],
    tool_choice: { type: "tool", name: "extract_recipe" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("No tool_use block in worker response");
  }

  const recipe = RecipeSchema.parse(toolUseBlock.input);

  const workerPrompt = [
    "SYSTEM:\n" + systemText,
    "USER: [image] Extract the recipe from this image.",
  ].join("\n\n");

  return { recipe, workerPrompt };
}

// ── parseRecipeFromUrl ────────────────────────────────────────────────────────
export async function parseRecipeFromUrl(
  url: string
): Promise<{ recipe: Recipe; workerPrompt: string; strippedText: string }> {
  const client = getClient();

  // Fetch with 10s timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let rawHtml: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    rawHtml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // Strip scripts, styles, and tags
  const strippedText = rawHtml
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);

  const systemText = WORKER_SYSTEM_BASE
    .replace(
      "2. The image may contain a title, ingredients, instructions, nutrition info, and notes spread anywhere — TOP to BOTTOM. Scan the entire image.",
      WORKER_SYSTEM_URL_EXTRA.trim()
    )
    .concat(
      `\n\nSource URL: ${url}. Use the hostname for \`source_attribution\` if no explicit byline appears (e.g. 'NYT Cooking', 'Bon Appétit'). Populate \`source_url\` with the URL.`
    );

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [workerTool],
    tool_choice: { type: "tool", name: "extract_recipe" },
    messages: [
      {
        role: "user",
        content: strippedText,
      },
    ],
  });

  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("No tool_use block in URL worker response");
  }

  const recipe = RecipeSchema.parse(toolUseBlock.input);

  const workerPrompt = [
    "SYSTEM:\n" + systemText,
    "USER:\n" + strippedText.slice(0, 500) + "…",
  ].join("\n\n");

  return { recipe, workerPrompt, strippedText };
}

// ── parseReceiptFromImage ─────────────────────────────────────────────────────
export async function parseReceiptFromImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ReceiptParse> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    // Long receipts can hold many line items — give the worker headroom.
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: RECEIPT_SYSTEM_BASE,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [receiptTool],
    tool_choice: { type: "tool", name: "extract_receipt" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "Extract the grocery items from this receipt.",
          },
        ],
      },
    ],
  });

  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("No tool_use block in receipt response");
  }

  return ReceiptParseSchema.parse(toolUseBlock.input);
}

// ── gradeRecipeParse ──────────────────────────────────────────────────────────
export async function gradeRecipeParse(input: {
  sourceKind: "image" | "url";
  sourceRef: string;
  workerPrompt: string;
  workerOutput: Recipe;
  sourceContent?:
    | { kind: "url-text"; text: string }
    | { kind: "image"; base64: string; mediaType: string };
}): Promise<{
  verdict: JudgeVerdict;
  judgePrompt: string;
  rawJudgeOutput: string;
}> {
  const client = getClient();

  const recipeSchemaJson = JSON.stringify(recipeJsonSchema, null, 2);

  const judgeSystem = `You are an expert culinary editor evaluating an automated recipe-parsing system.

The parser was asked to extract a recipe into this exact structured schema:

${recipeSchemaJson}

You will receive (1) the source the parser saw (URL+text or image) and (2) the structured Recipe JSON the parser produced.

Grade three dimensions independently on a 0-10 scale:

  overall_grade       — holistic quality.
  accuracy_grade      — are the populated fields correct? Compare structured value/unit against \`as_written\` strings; flag hallucinations.
  completeness_grade  — did the parser populate every field the source actually contained? A null is correct only if the source genuinely lacked that info. Penalize missing nutrition, timing, equipment, etc. when the source provided them.

For each issue, add a JudgeFieldCheck with the exact dotted path (e.g. "ingredients[3].quantity.unit" or "nutrition.kcal") and one of: missing | incorrect | hallucinated | fine.

If you spot a recurring pattern (parser consistently drops X-type info), populate suggested_prompt_improvements with one concrete sentence to add to the parser prompt.

Return ONLY the tool call — no prose.`;

  const userTextBlock = `SOURCE_KIND: ${input.sourceKind}\nSOURCE_REF: ${input.sourceRef}\nWORKER_OUTPUT:\n${JSON.stringify(input.workerOutput, null, 2)}`;

  const userContent: Anthropic.MessageParam["content"] = [
    { type: "text", text: userTextBlock },
  ];

  if (input.sourceContent) {
    if (input.sourceContent.kind === "image") {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.sourceContent.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          data: input.sourceContent.base64,
        },
      });
    } else {
      userContent.push({
        type: "text",
        text: `SOURCE_TEXT:\n${input.sourceContent.text}`,
      });
    }
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: judgeSystem,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [judgeTool],
    tool_choice: { type: "tool", name: "submit_verdict" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUseBlock) {
    throw new Error("No tool_use block in judge response");
  }

  const verdict = JudgeVerdictSchema.parse(toolUseBlock.input);

  const judgePrompt = [
    "SYSTEM:\n" + judgeSystem,
    "USER:\n" + userTextBlock,
  ].join("\n\n");

  const rawJudgeOutput = JSON.stringify(toolUseBlock.input);

  return { verdict, judgePrompt, rawJudgeOutput };
}
