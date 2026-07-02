"use server";

import { revalidatePath } from "next/cache";
import { addPlannedMeal, removePlannedMeal } from "@/lib/db/meal-plans";

type ActionResult = { ok: true } | { error: string };

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Add a recipe to a day of the given week's plan. */
export async function addPlannedMealAction(
  weekOf: string,
  dayIndex: number,
  recipeId: string,
): Promise<ActionResult> {
  try {
    await addPlannedMeal(weekOf, dayIndex, recipeId);
    revalidatePath("/plan");
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Remove a recipe from a day of the given week's plan. */
export async function removePlannedMealAction(
  weekOf: string,
  dayIndex: number,
  recipeId: string,
): Promise<ActionResult> {
  try {
    await removePlannedMeal(weekOf, dayIndex, recipeId);
    revalidatePath("/plan");
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}
