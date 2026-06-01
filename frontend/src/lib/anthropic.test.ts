/**
 * @vitest-environment node
 *
 * Offline unit tests for parseRecipe().
 * No network or API key required — @anthropic-ai/sdk and global fetch are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk before importing the module under test
// ---------------------------------------------------------------------------

// We will set up the mock return value per-test via `mockFinalMessage`.
let mockFinalMessage: () => Promise<unknown>;

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = {
      stream: vi.fn().mockImplementation(() => ({
        finalMessage: () => mockFinalMessage(),
      })),
    };
  }
  return { default: MockAnthropic };
});

// Mock env so getAnthropicApiKey() doesn't throw
vi.mock("@/lib/env", () => ({
  getAnthropicApiKey: () => "sk-test-key",
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { parseRecipe, RecipeParseError } from "./anthropic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolUseMessage(input: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
    content: [
      {
        type: "tool_use",
        id: "toolu_01",
        name: "save_recipe",
        input,
      },
    ],
  };
}

function makeNoToolMessage() {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "text", text: "I found a recipe for you." }],
  };
}

const VALID_RECIPE_INPUT = {
  title: "Simple Pasta",
  sourceUrl: "https://example.com/pasta",
  ingredients: [
    { name: "pasta", amount: 200, unit: "g" },
    { name: "salt", amount: 1, unit: "tsp" },
  ],
  steps: [
    { text: "Boil water in a large pot." },
    { text: "Add pasta and cook for 10 minutes." },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseRecipe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) returns schema-valid RecipeCreate when model returns valid save_recipe tool use", async () => {
    mockFinalMessage = async () => makeToolUseMessage(VALID_RECIPE_INPUT);

    const result = await parseRecipe({ text: "Simple pasta recipe" });

    expect(result.title).toBe("Simple Pasta");
    expect(result.ingredients).toHaveLength(2);
    expect(result.ingredients[0].name).toBe("pasta");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].text).toBe("Boil water in a large pot.");
    // sourceUrl from tool response
    expect(result.sourceUrl).toBe("https://example.com/pasta");
  });

  it("(a) attaches the input URL as sourceUrl when model omits it", async () => {
    const inputWithoutUrl = { ...VALID_RECIPE_INPUT, sourceUrl: undefined };
    mockFinalMessage = async () => makeToolUseMessage(inputWithoutUrl);

    // Mock fetch to return a fake HTML page for URL mode
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body>Simple pasta recipe</body></html>",
    } as Response);

    const result = await parseRecipe({
      url: "https://example.com/pasta",
    });

    expect(result.sourceUrl).toBe("https://example.com/pasta");
  });

  it("(b) throws RecipeParseError when model returns no tool_use block", async () => {
    mockFinalMessage = async () => makeNoToolMessage();

    await expect(parseRecipe({ text: "Some text" })).rejects.toThrow(
      RecipeParseError,
    );
    await expect(parseRecipe({ text: "Some text" })).rejects.toThrow(
      "save_recipe",
    );
  });

  it("(b) throws RecipeParseError when tool_use input is missing required fields", async () => {
    // Missing title — recipeCreateSchema will fail
    mockFinalMessage = async () =>
      makeToolUseMessage({
        ingredients: [{ name: "flour" }],
        steps: [{ text: "Mix it." }],
        // no title
      });

    await expect(parseRecipe({ text: "Some text" })).rejects.toThrow(
      RecipeParseError,
    );
    await expect(parseRecipe({ text: "Some text" })).rejects.toThrow(
      /invalid recipe structure/i,
    );
  });

  it("(b) throws RecipeParseError when tool_use input has empty title", async () => {
    mockFinalMessage = async () =>
      makeToolUseMessage({ title: "", ingredients: [], steps: [] });

    await expect(parseRecipe({ text: "Some text" })).rejects.toThrow(
      RecipeParseError,
    );
  });

  it("(c) throws RecipeParseError when fetch rejects for URL input", async () => {
    // We need to mock fetch only for this test — using vi.spyOn on globalThis
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network error: connection refused"));

    await expect(
      parseRecipe({ url: "https://example.com/recipe" }),
    ).rejects.toThrow(RecipeParseError);

    await expect(
      parseRecipe({ url: "https://example.com/recipe" }),
    ).rejects.toThrow(/Failed to fetch URL/);

    fetchSpy.mockRestore();
  });

  it("throws RecipeParseError when no input fields are provided", async () => {
    await expect(parseRecipe({})).rejects.toThrow(RecipeParseError);
    await expect(parseRecipe({})).rejects.toThrow(
      /at least one of url, text, or imageBase64/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Edge cases — added by T8
// ---------------------------------------------------------------------------

describe("parseRecipe — image input path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts imageBase64 + imageMediaType and calls the model", async () => {
    mockFinalMessage = async () => makeToolUseMessage(VALID_RECIPE_INPUT);

    const result = await parseRecipe({
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
      imageMediaType: "image/png",
    });

    expect(result.title).toBe("Simple Pasta");
  });

  it("throws RecipeParseError when imageBase64 is provided without imageMediaType", async () => {
    // No model call expected — validation fails before reaching the SDK
    await expect(
      parseRecipe({ imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA" }),
    ).rejects.toThrow(RecipeParseError);
    await expect(
      parseRecipe({ imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA" }),
    ).rejects.toThrow(/at least one of url, text, or imageBase64/i);
  });

  it("throws RecipeParseError when imageMediaType is provided without imageBase64", async () => {
    await expect(
      parseRecipe({ imageMediaType: "image/jpeg" }),
    ).rejects.toThrow(RecipeParseError);
  });
});

describe("parseRecipe — URL fetch error paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws RecipeParseError when URL fetch returns non-ok status", async () => {
    // Use mockResolvedValue (persistent, not Once) so the single assertion works cleanly
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const err = await parseRecipe({ url: "https://example.com/missing-page" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RecipeParseError);
    expect((err as RecipeParseError).message).toMatch(/HTTP 404/);
  });
});

describe("parseRecipe — schema edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a recipe with empty ingredients array", async () => {
    mockFinalMessage = async () =>
      makeToolUseMessage({
        title: "Mystery Dish",
        ingredients: [],
        steps: [{ text: "Combine all ingredients." }],
      });

    const result = await parseRecipe({ text: "Minimal recipe" });
    expect(result.title).toBe("Mystery Dish");
    expect(result.ingredients).toHaveLength(0);
  });

  it("accepts a recipe with empty steps array", async () => {
    mockFinalMessage = async () =>
      makeToolUseMessage({
        title: "Platter",
        ingredients: [{ name: "cheese" }],
        steps: [],
      });

    const result = await parseRecipe({ text: "Just cheese" });
    expect(result.title).toBe("Platter");
    expect(result.steps).toHaveLength(0);
  });

  it("preserves sourceUrl set by the model even when url is also provided", async () => {
    // Model returns a different sourceUrl than what was passed in
    mockFinalMessage = async () =>
      makeToolUseMessage({
        ...VALID_RECIPE_INPUT,
        sourceUrl: "https://canonical.example.com/pasta",
      });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body>pasta recipe</body></html>",
    } as Response);

    const result = await parseRecipe({ url: "https://example.com/pasta" });
    // Model's sourceUrl takes precedence
    expect(result.sourceUrl).toBe("https://canonical.example.com/pasta");
  });
});
