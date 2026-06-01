import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { recipes, ingredients, steps } from "@/db/schema";
import { recipeCreateSchema } from "@/lib/schemas";
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

  const { title, sourceUrl, ingredients: ingList, steps: stepList } = parsed.data;

  // Insert recipe
  const [recipe] = await db
    .insert(recipes)
    .values({ title, sourceUrl: sourceUrl ?? null })
    .returning();

  // Insert ingredients (assign positions if not provided)
  if (ingList.length > 0) {
    await db.insert(ingredients).values(
      ingList.map((ing, idx) => ({
        recipeId: recipe.id,
        name: ing.name,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        notes: ing.notes ?? null,
        position: ing.position ?? idx,
      })),
    );
  }

  // Insert steps (assign positions if not provided)
  if (stepList.length > 0) {
    await db.insert(steps).values(
      stepList.map((step, idx) => ({
        recipeId: recipe.id,
        position: step.position ?? idx,
        text: step.text,
      })),
    );
  }

  return NextResponse.json(recipe, { status: 201 });
}
