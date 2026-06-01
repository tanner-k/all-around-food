import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { recipes, ingredients, steps } from "@/db/schema";
import { recipeUpdateSchema } from "@/lib/schemas";
import { eq, asc } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/recipes/[id] — get one recipe with ordered ingredients and steps.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
  });

  if (!recipe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [recipeIngredients, recipeSteps] = await Promise.all([
    db
      .select()
      .from(ingredients)
      .where(eq(ingredients.recipeId, id))
      .orderBy(asc(ingredients.position)),
    db
      .select()
      .from(steps)
      .where(eq(steps.recipeId, id))
      .orderBy(asc(steps.position)),
  ]);

  return NextResponse.json({
    ...recipe,
    ingredients: recipeIngredients,
    steps: recipeSteps,
  });
}

/**
 * PATCH /api/recipes/[id] — partial update of a recipe's top-level fields.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = recipeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { title, sourceUrl } = parsed.data;

  const updates: Partial<{ title: string; sourceUrl: string | null }> = {};
  if (title !== undefined) updates.title = title;
  if (sourceUrl !== undefined) updates.sourceUrl = sourceUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db
    .update(recipes)
    .set(updates)
    .where(eq(recipes.id, id))
    .returning();

  return NextResponse.json(updated);
}

/**
 * DELETE /api/recipes/[id] — delete a recipe (cascades to ingredients and steps).
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(recipes).where(eq(recipes.id, id));

  return NextResponse.json({ deleted: true });
}
