"use server";

import { revalidatePath } from "next/cache";
import { updateRecipe, incrementTimesMade } from "@/lib/db/recipes";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";

type ActionResult = { ok: true } | { error: string };

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Revalidate the cookbook routes affected by a change to one recipe. */
function revalidateRecipe(id: string): void {
  revalidatePath("/cookbook");
  revalidatePath(`/cookbook/${id}`);
  revalidatePath(`/cookbook/${id}/edit`);
  revalidatePath(`/cookbook/${id}/cook`);
}

/** Save edits from the recipe edit form. */
export async function updateRecipeAction(
  id: string,
  input: Recipe,
): Promise<ActionResult> {
  try {
    const parsed = RecipeSchema.parse(input);
    await updateRecipe(id, parsed);
    revalidateRecipe(id);
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Increment a recipe's cook count ("mark cooked"). */
export async function markCookedAction(id: string): Promise<ActionResult> {
  try {
    await incrementTimesMade(id);
    revalidateRecipe(id);
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}
