import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { recipes } from "@/db/schema";
import { recipeCreateSchema } from "@/lib/schemas";
import { createRecipeWithChildren } from "@/app/api/_lib/recipes";
import { desc } from "drizzle-orm";

/**
 * GET /api/recipes — list all recipes, newest first.
 * Not user-scoped (recipes are shared).
 */
export async function GET() {
  const rows = await db
    .select()
    .from(recipes)
    .orderBy(desc(recipes.createdAt));

  return NextResponse.json(rows);
}

/**
 * POST /api/recipes — create a recipe with its ingredients and steps.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = recipeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const recipe = await createRecipeWithChildren(parsed.data);

  return NextResponse.json(recipe, { status: 201 });
}
