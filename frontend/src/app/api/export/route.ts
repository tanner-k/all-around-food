import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBackup, type BackupEnvelope } from "@/lib/local/backup";
import { RecipeSchema } from "@/lib/recipe-schema";
import type { LibrarySnapshot } from "@/lib/local/schema";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const PAGE_SIZE = 500;

export async function GET(request?: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to export your library." }, { status: 401, headers });

    // The database owner gate is also used by the import protocol. Fail closed
    // until the personal owner's UUID has been configured in Supabase.
    const { data: ownerId, error: ownerError } = await supabase.rpc("import_owner_uid");
    if (ownerError || !ownerId || ownerId !== user.id) {
      return NextResponse.json({ error: "Only the configured library owner may export." }, { status: 403, headers });
    }

    const params = request ? new URL(request.url).searchParams : null;
    const recipeCopy = params?.get("scope") === "recipes";
    if (recipeCopy && params?.get("expected_owner") !== user.id) {
      return NextResponse.json({ error: "Cloud export owner does not match this account. Sign in again." }, { status: 409, headers });
    }

    async function allRows(table: string) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.from(table).select("*").order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`Unable to read ${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    }

    const [recipes, headersRows, mealRows, pantry, shopping] = await Promise.all([
      allRows("recipes"), allRows("meal_plans"), allRows("planned_meals"),
      allRows("pantry_items"), allRows("shopping_list_items"),
    ]);
    if (recipeCopy) {
      const parsedRecipes = RecipeSchema.array().parse(recipes);
      if (new Set(parsedRecipes.map(recipe => recipe.id)).size !== parsedRecipes.length) throw new Error("Duplicate recipe IDs.");
      return NextResponse.json({
        format: "all-around-food", version: 1, owner_id: user.id, exported_at: new Date().toISOString(),
        library: { recipes, meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] },
        legacy_tables: { meal_plans: headersRows, planned_meals: mealRows, pantry_items: pantry, shopping_list_items: shopping },
      }, { headers });
    }
    const planById = new Map(headersRows.map((row) => [row.id, row]));
    const recipeIds = new Set(recipes.map((row) => row.id));
    const errors: string[] = [];
    for (const row of headersRows) {
      if (row.id !== row.week_of) errors.push(`Plan ${row.id} does not match week ${row.week_of}.`);
    }
    const children = new Map<unknown, Record<string, unknown>[]>();
    for (const row of mealRows) {
      if (!planById.has(row.meal_plan_id)) errors.push(`Planned meal ${row.id} has no plan header ${row.meal_plan_id}.`);
      if (!row.recipe_id || !recipeIds.has(row.recipe_id)) errors.push(`Planned meal ${row.id} references missing recipe ${row.recipe_id}.`);
      const list = children.get(row.meal_plan_id) ?? [];
      list.push(row);
      children.set(row.meal_plan_id, list);
    }
    if (errors.length) return NextResponse.json({ error: "Cloud library contains orphan references.", validation_errors: errors }, { status: 409, headers });

    const library = {
      recipes,
      meal_plans: headersRows.map((header) => ({
        week_of: header.week_of,
        updated_at: header.updated_at,
        meals: (children.get(header.id) ?? []).map((meal) => ({
          day_index: meal.day_index,
          recipe_id: meal.recipe_id,
          servings: meal.servings ?? null,
        })),
      })),
      pantry,
      shopping,
      cook_progress: [],
      drafts: [],
      settings: [],
    } as unknown as LibrarySnapshot;
    const backup: BackupEnvelope = {
      format: "all-around-food",
      version: 1,
      exported_at: new Date().toISOString(),
      library,
    };
    const parsed = parseBackup(JSON.stringify(backup));
    if (parsed.errors.length) return NextResponse.json({ error: "Cloud export failed validation.", validation_errors: parsed.errors }, { status: 409, headers });
    return NextResponse.json(parsed.backup, {
      headers: { ...headers, "Content-Disposition": 'attachment; filename="all-around-food-cloud-export.json"' },
    });
  } catch (error) {
    console.error("[export] failed", error);
    return NextResponse.json({ error: "Unable to export cloud library." }, { status: 502, headers });
  }
}
