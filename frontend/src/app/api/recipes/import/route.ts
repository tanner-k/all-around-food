import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseRecipe, RecipeParseError } from "@/lib/anthropic";
import { createRecipeWithChildren } from "@/app/api/_lib/recipes";

// ---------------------------------------------------------------------------
// Request body schema — at least one source field is required
// ---------------------------------------------------------------------------

const importBodySchema = z
  .object({
    url: z.string().url().optional(),
    text: z.string().min(1).optional(),
    imageBase64: z.string().min(1).optional(),
    imageMediaType: z.string().min(1).optional(),
  })
  .refine(
    (data) => data.url !== undefined || data.text !== undefined || data.imageBase64 !== undefined,
    {
      message: "At least one of url, text, or imageBase64 must be provided.",
    },
  );

// ---------------------------------------------------------------------------
// POST /api/recipes/import
// ---------------------------------------------------------------------------

/**
 * Import a recipe from a URL, pasted text, or a base64-encoded image.
 *
 * Request body (JSON):
 *   { url?: string; text?: string; imageBase64?: string; imageMediaType?: string }
 *
 * Responses:
 *   201  Created recipe row
 *   400  Missing/invalid body
 *   422  Model could not parse the recipe
 *   500  Unexpected server error
 */
export async function POST(request: NextRequest) {
  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate
  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { url, text, imageBase64, imageMediaType } = parsed.data;

  // Parse recipe via AI
  let recipeInput;
  try {
    recipeInput = await parseRecipe({ url, text, imageBase64, imageMediaType });
  } catch (err) {
    if (err instanceof RecipeParseError) {
      return NextResponse.json(
        { error: "Could not extract a recipe from the provided source. Please try a different URL or paste the recipe text directly." },
        { status: 422 },
      );
    }
    // Unexpected errors — log server-side, return generic 500
    console.error("[api/recipes/import] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }

  // Persist
  let recipe;
  try {
    recipe = await createRecipeWithChildren(recipeInput);
  } catch (err) {
    console.error("[api/recipes/import] DB error:", err);
    return NextResponse.json(
      { error: "Failed to save the recipe. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(recipe, { status: 201 });
}
