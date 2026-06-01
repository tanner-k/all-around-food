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
