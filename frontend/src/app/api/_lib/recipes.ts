// SERVER-ONLY — do not import from client components.
// Shared helper: insert a recipe + its children (ingredients, steps) in one go.

import { db } from "@/db/client";
import { recipes, ingredients, steps } from "@/db/schema";
import { RecipeCreate } from "@/lib/schemas";

/**
 * Insert a recipe row together with its ingredients and steps.
 * Returns the created recipe row.
 * Positions are assigned by array index when not explicitly provided.
 */
export async function createRecipeWithChildren(input: RecipeCreate) {
  const { title, sourceUrl, ingredients: ingList, steps: stepList } = input;

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

  return recipe;
}
