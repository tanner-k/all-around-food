// SERVER-ONLY — do not import from client components.
// Recipe parsing via the Anthropic API.
//
// SECURITY: getAnthropicApiKey() is called lazily, inside functions only.
// Never call it at module top-level — that throws at build time when no
// secrets are set.

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import { recipeCreateSchema, RecipeCreate } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

/** Thrown when the model response cannot be parsed into a valid RecipeCreate. */
export class RecipeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeParseError";
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const SAVE_RECIPE_TOOL: Anthropic.Tool = {
  name: "save_recipe",
  description:
    "Save a structured recipe parsed from the provided source material.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Recipe title" },
      sourceUrl: {
        type: "string",
        description: "Original URL the recipe came from, if applicable",
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            amount: { type: "number" },
            unit: { type: "string" },
            notes: { type: "string" },
            position: { type: "number" },
          },
          required: ["name"],
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            position: { type: "number" },
          },
          required: ["text"],
        },
      },
    },
    required: ["title", "ingredients", "steps"],
  },
};

// ---------------------------------------------------------------------------
// System prompt (cached)
// ---------------------------------------------------------------------------

function buildSystemPrompt(): Array<Anthropic.TextBlockParam> {
  // Using an array so we can attach cache_control to the last block for
  // prompt caching (reuses the cached prefix on repeated calls).
  return [
    {
      type: "text",
      text: "You are a recipe extraction assistant. Your sole job is to parse recipe source material (URLs, raw text, or images) and call the save_recipe tool with the structured result.",
    },
    {
      type: "text",
      text: `Rules:
- Always call save_recipe — never reply in plain text.
- Extract every ingredient with its name, amount, unit, and notes where available.
- Extract every step as a plain English sentence.
- Set sourceUrl only when the user provides a URL.
- If a field is not present in the source, omit it rather than inventing a value.`,
      // Prompt caching: mark the last block as ephemeral so subsequent calls
      // within the same session reuse the cached prefix.
      cache_control: { type: "ephemeral" },
    },
  ];
}

// ---------------------------------------------------------------------------
// URL fetching helper
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and return stripped plain text (HTML tags removed).
 * Throws RecipeParseError on network failure.
 */
async function fetchPageText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RecipeParseError(`Failed to fetch URL: ${msg}`);
  }

  if (!response.ok) {
    throw new RecipeParseError(
      `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  // Strip HTML tags, collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ParseRecipeInput {
  url?: string;
  text?: string;
  imageBase64?: string;
  imageMediaType?: string;
}

/**
 * Parse a recipe from a URL, plain text, or a base64-encoded image.
 * Returns a validated RecipeCreate object ready to persist.
 * Throws RecipeParseError for parse failures; other errors propagate as-is.
 */
export async function parseRecipe(
  input: ParseRecipeInput,
): Promise<RecipeCreate> {
  // Construct Anthropic client request-time, never at module top-level.
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });

  const { url, text, imageBase64, imageMediaType } = input;

  // Build the user message content
  const userContent: Anthropic.MessageParam["content"] = [];

  if (url) {
    const pageText = await fetchPageText(url);
    userContent.push({
      type: "text",
      text: `Recipe source URL: ${url}\n\nPage content:\n${pageText.slice(0, 20_000)}`,
    });
  } else if (text) {
    userContent.push({ type: "text", text });
  } else if (imageBase64 && imageMediaType) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imageMediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: imageBase64,
      },
    });
  } else {
    throw new RecipeParseError(
      "At least one of url, text, or imageBase64 must be provided.",
    );
  }

  // Call the model with the forced tool
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userContent }],
    tools: [SAVE_RECIPE_TOOL],
    tool_choice: { type: "tool", name: "save_recipe" },
  });

  const message = await stream.finalMessage();

  // Extract the tool_use block
  const toolUseBlock = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUseBlock) {
    throw new RecipeParseError(
      "Model did not return a save_recipe tool call.",
    );
  }

  // Validate with the canonical schema
  const parsed = recipeCreateSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    throw new RecipeParseError(
      `Model returned an invalid recipe structure: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }

  // Attach sourceUrl from the URL input if not already set by the model
  if (url && !parsed.data.sourceUrl) {
    return { ...parsed.data, sourceUrl: url };
  }

  return parsed.data;
}
