// Server-only data-access layer for weekly meal plans, backed by Supabase.
//
// RLS scopes every query to the signed-in user via the cookie-bound server
// client — do NOT pass a service-role key here. The plan is modeled across two
// tables: a `meal_plans` header row (PK `id` = `week_of`) and child
// `planned_meals` rows (one per recipe-on-a-day). The UI works with the flat
// `MealPlan` shape (`{ week_of, meals: [{day_index, recipe_id}], updated_at }`),
// so reads assemble `meals` from the `planned_meals` rows and writes add/remove
// individual `planned_meals` rows.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MealPlanSchema, type MealPlan } from "@/lib/meal-plan-schema";

const HEADER_TABLE = "meal_plans";
const MEALS_TABLE = "planned_meals";

/**
 * Deterministic id for a planned-meal slot. Keyed on
 * `${weekOf}:${dayIndex}:${recipeId}` so re-adding the same recipe to the same
 * day upserts in place (idempotent) rather than creating a duplicate row.
 */
function plannedMealId(
  weekOf: string,
  dayIndex: number,
  recipeId: string,
): string {
  return `${weekOf}:${dayIndex}:${recipeId}`;
}

/**
 * Read the meal plan for a week. Fetches the `planned_meals` rows scoped to the
 * week's header (`meal_plan_id = weekOf`) and assembles them into the flat
 * `MealPlan` shape the UI expects. Returns an empty plan (no header write) when
 * the week has no planned meals.
 */
export async function getMealPlan(weekOf: string): Promise<MealPlan> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(MEALS_TABLE)
    .select("day_index, recipe_id")
    .eq("meal_plan_id", weekOf)
    .order("day_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load meal plan: ${error.message}`);

  const meals = (data ?? [])
    .filter((row) => row.recipe_id != null)
    .map((row) => ({
      day_index: row.day_index as number,
      recipe_id: row.recipe_id as string,
    }));

  return MealPlanSchema.parse({ week_of: weekOf, meals, updated_at: "" });
}

/**
 * Ensure the `meal_plans` header row for `weekOf` exists (insert `{id, week_of}`
 * on conflict do nothing) and refresh its `updated_at`. RLS stamps `user_id`
 * from `auth.uid()` on insert.
 */
async function touchHeader(weekOf: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(HEADER_TABLE)
    .upsert(
      { id: weekOf, week_of: weekOf, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

  if (error) throw new Error(`Failed to save meal plan: ${error.message}`);
}

/**
 * Add a recipe to a day. Ensures the week's header exists, then upserts a
 * `planned_meals` row keyed on the deterministic slot id so re-adds are
 * idempotent. `user_id` is stamped from `auth.uid()` by the column default.
 */
export async function addPlannedMeal(
  weekOf: string,
  dayIndex: number,
  recipeId: string,
): Promise<void> {
  await touchHeader(weekOf);

  const supabase = await createClient();
  const { error } = await supabase.from(MEALS_TABLE).upsert(
    {
      id: plannedMealId(weekOf, dayIndex, recipeId),
      meal_plan_id: weekOf,
      day_index: dayIndex,
      recipe_id: recipeId,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`Failed to add planned meal: ${error.message}`);
}

/**
 * Remove a recipe from a day. Deletes the matching `planned_meals` row(s) and
 * touches the week's `updated_at`. RLS ensures only the user's own rows are
 * affected.
 */
export async function removePlannedMeal(
  weekOf: string,
  dayIndex: number,
  recipeId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(MEALS_TABLE)
    .delete()
    .eq("meal_plan_id", weekOf)
    .eq("day_index", dayIndex)
    .eq("recipe_id", recipeId);

  if (error) throw new Error(`Failed to remove planned meal: ${error.message}`);

  await touchHeader(weekOf);
}
