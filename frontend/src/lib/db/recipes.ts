// Server-only data-access layer for recipes, backed by Supabase.
//
// RLS scopes every query to the signed-in user via the cookie-bound server
// client — do NOT pass a service-role key here. The `recipes` table columns
// mirror the `Recipe` type 1:1, with `ingredients` / `steps` / `equipment` /
// `dietary_tags` / `nutrition` stored as jsonb (supabase-js returns them
// already parsed) plus extra `user_id` / `created_at` columns.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";

const TABLE = "recipes";

// Columns the edit form is allowed to write back. `times_made`, `id`,
// `user_id`, `created_at`, and `parse_confidence` are intentionally excluded.
const EDITABLE_COLUMNS = [
  "title",
  "description",
  "source_url",
  "source_attribution",
  "prep_time_min",
  "cook_time_min",
  "total_time_min",
  "servings",
  "yield_text",
  "ingredients",
  "steps",
  "equipment",
  "cuisine",
  "course",
  "dietary_tags",
  "difficulty",
  "nutrition",
  "notes",
  "storage_instructions",
] as const;

/**
 * Validate a raw DB row against the Recipe schema. The jsonb fields come back
 * from supabase-js already parsed, so the shape matches `Recipe` directly; we
 * strip `user_id` (and any other extra columns) via the schema, which ignores
 * unknown keys.
 */
function parseRow(row: unknown): Recipe {
  return RecipeSchema.parse(row);
}

/** All of the current user's recipes, most-cooked first, then newest. */
export async function listRecipes(): Promise<Recipe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("times_made", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list recipes: ${error.message}`);
  return (data ?? []).map(parseRow);
}

/** A single recipe by id, or null if not found (or not owned by the user). */
export async function getRecipe(id: string): Promise<Recipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load recipe: ${error.message}`);
  if (!data) return null;
  return parseRow(data);
}

/**
 * Update the editable columns of a recipe from an edit-form payload. Nested
 * fields (ingredients/steps/equipment/dietary_tags/nutrition) are written back
 * as-is; supabase-js serializes them into the jsonb columns. Returns the
 * updated recipe.
 */
export async function updateRecipe(
  id: string,
  input: Recipe,
): Promise<Recipe> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  for (const col of EDITABLE_COLUMNS) {
    patch[col] = input[col];
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update recipe: ${error.message}`);
  if (!data) throw new Error("Recipe not found");
  return parseRow(data);
}

/**
 * Increment a recipe's cook count. Read-modify-write: read the current value,
 * write `times_made + 1`. RLS ensures we only ever touch the user's own row.
 */
export async function incrementTimesMade(id: string): Promise<Recipe> {
  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from(TABLE)
    .select("times_made")
    .eq("id", id)
    .maybeSingle();

  if (readError)
    throw new Error(`Failed to read recipe: ${readError.message}`);
  if (!current) throw new Error("Recipe not found");

  const next = (current.times_made ?? 0) + 1;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ times_made: next })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update cook count: ${error.message}`);
  if (!data) throw new Error("Recipe not found");
  return parseRow(data);
}
