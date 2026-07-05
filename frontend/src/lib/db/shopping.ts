// Server-only data-access layer for the shopping list, backed by Supabase.
//
// RLS scopes every query to the signed-in user via the cookie-bound server
// client — do NOT pass a service-role key here. The `shopping_list_items` table
// columns mirror the `ShoppingListItem` type, plus a `user_id` column the DB
// fills from `auth.uid()` on insert (never set here). `id` is a text PK with no
// DB default, so inserts generate one client-side.
//
// The pure list logic (categorize / normalizeName / aggregation / grouping)
// lives in @/lib/shopping-logic, ported from the former Python backend. This module
// composes those helpers around DB reads/writes. Pantry flags are read straight
// from the `pantry_items` table (query, don't import the pantry domain module).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  ShoppingListItemSchema,
  type ShoppingListItem,
  type ShoppingListResponse,
} from "@/lib/shopping-schema";
import { PantryItemSchema, type PantryItem } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { normalizeName } from "@/lib/normalize";
import {
  aggregateRecipeIngredients,
  buildShoppingListResponse,
  categorize,
  computePantryFlags,
  pantryIndex,
  recomputeAllFlags,
} from "@/lib/shopping-logic";

const TABLE = "shopping_list_items";
const PANTRY_TABLE = "pantry_items";
const RECIPES_TABLE = "recipes";

/** Validate a raw DB row against the ShoppingListItem schema. */
function parseRow(row: unknown): ShoppingListItem {
  return ShoppingListItemSchema.parse(row);
}

/** Load every pantry item for the current user (for flag computation). */
async function loadPantryItems(): Promise<PantryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(PANTRY_TABLE).select("*");
  if (error) throw new Error(`Failed to load pantry: ${error.message}`);
  return (data ?? []).map((row) => PantryItemSchema.parse(row));
}

/** Load all shopping-list items for the current user. */
async function loadItems(): Promise<ShoppingListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error)
    throw new Error(`Failed to load shopping list: ${error.message}`);
  return (data ?? []).map(parseRow);
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Options for the "add from recipes" picker. */
export interface RecipeOption {
  id: string;
  title: string;
}

/**
 * The current shopping list, grouped by aisle. Mirrors `GET /shopping-list`:
 * every item is returned; pantry stock status rides on each item's flags.
 */
export async function getShoppingList(): Promise<ShoppingListResponse> {
  const items = await loadItems();
  return buildShoppingListResponse(items);
}

/**
 * Lightweight recipe list for the "add from recipes" modal — `{id, title}`
 * only, ordered like the cookbook (most-cooked first, then newest). RLS-scoped.
 */
export async function listRecipeOptions(): Promise<RecipeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(RECIPES_TABLE)
    .select("id, title")
    .order("times_made", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list recipes: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
  }));
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Add a manual item. Mirrors `POST /shopping-list/items`: normalizes the name,
 * auto-categorizes the aisle, marks `source = "manual"`, and computes pantry
 * flags from the current pantry. `user_id` is stamped from `auth.uid()`.
 * Returns the inserted item.
 */
export async function addManualItem(
  name: string,
  quantityText?: string | null,
): Promise<ShoppingListItem> {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Item name is required");

  const pantry = await loadPantryItems();
  const base: ShoppingListItem = {
    id: crypto.randomUUID(),
    name: normalized,
    quantity_text: quantityText ? quantityText : null,
    aisle: categorize(normalized),
    checked: false,
    source: "manual",
    source_recipe_id: null,
    pantry_covered: false,
    pantry_low: false,
    created_at: new Date().toISOString(),
  };
  const flagged = computePantryFlags(base, pantryIndex(pantry));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id: flagged.id,
      name: flagged.name,
      quantity_text: flagged.quantity_text,
      aisle: flagged.aisle,
      checked: flagged.checked,
      source: flagged.source,
      source_recipe_id: flagged.source_recipe_id,
      pantry_covered: flagged.pantry_covered,
      pantry_low: flagged.pantry_low,
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to add item: ${error.message}`);
  if (!data) throw new Error("Failed to add item");
  return parseRow(data);
}

/**
 * Toggle a single item's checked state. Mirrors
 * `PATCH /shopping-list/items/{id}/check`. Returns the updated item.
 */
export async function toggleChecked(
  id: string,
  checked: boolean,
): Promise<ShoppingListItem> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ checked })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update item: ${error.message}`);
  if (!data) throw new Error("Shopping list item not found");
  return parseRow(data);
}

/** Delete a single item. Mirrors `DELETE /shopping-list/items/{id}`. */
export async function removeItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`Failed to remove item: ${error.message}`);
}

/** Result of a "mark bought" / "complete" run — mirrors the backend shape. */
export interface ShoppingCompletionResult {
  removed: number;
  pantry_added: number;
  pantry_updated: number;
}

/**
 * Upsert purchased items into the pantry as `in_stock`, matched by normalized
 * name. Existing pantry items are refreshed to in-stock; unknown items are
 * added, reusing the shopping item's aisle. Mirrors the backend `_stock_pantry`.
 * Returns add/update counts.
 */
async function stockPantry(
  items: ShoppingListItem[],
): Promise<{ added: number; updated: number }> {
  const supabase = await createClient();
  const pantry = await loadPantryItems();
  const byName = new Map<string, PantryItem>();
  for (const p of pantry) byName.set(normalizeName(p.name), p);

  let added = 0;
  let updated = 0;
  const nowIso = new Date().toISOString();

  for (const item of items) {
    const name = normalizeName(item.name);
    if (!name) continue;
    const existing = byName.get(name);
    if (existing === undefined) {
      const { error } = await supabase.from(PANTRY_TABLE).insert({
        id: crypto.randomUUID(),
        name,
        status: "in_stock",
        aisle: item.aisle,
        aisle_overridden: false,
        notes: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (error) throw new Error(`Failed to stock pantry: ${error.message}`);
      // Track locally so a duplicate name in the same batch updates, not re-adds.
      byName.set(name, {
        id: "",
        name,
        status: "in_stock",
        aisle: item.aisle,
        aisle_overridden: false,
        notes: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
      added += 1;
    } else {
      const { error } = await supabase
        .from(PANTRY_TABLE)
        .update({ status: "in_stock", updated_at: nowIso })
        .eq("id", existing.id);
      if (error) throw new Error(`Failed to stock pantry: ${error.message}`);
      updated += 1;
    }
  }
  return { added, updated };
}

/**
 * Recompute pantry flags across the whole shopping list and persist them.
 * Mirrors the backend `_refresh_shopping_flags`, called after pantry-mutating
 * operations so the list stays in sync with what's on hand.
 */
export async function recomputePantryFlags(): Promise<void> {
  const [items, pantry] = await Promise.all([
    loadItems(),
    loadPantryItems(),
  ]);
  const refreshed = recomputeAllFlags(items, pantry);

  const supabase = await createClient();
  for (const item of refreshed) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        pantry_covered: item.pantry_covered,
        pantry_low: item.pantry_low,
      })
      .eq("id", item.id);
    if (error)
      throw new Error(`Failed to refresh pantry flags: ${error.message}`);
  }
}

/**
 * Mark checked items as bought: stock them into the pantry, then delete them.
 * Mirrors `DELETE /shopping-list/checked`. Returns removed/pantry counts.
 */
export async function clearChecked(): Promise<ShoppingCompletionResult> {
  const items = await loadItems();
  const checked = items.filter((i) => i.checked);
  const { added, updated } = await stockPantry(checked);

  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).delete().eq("checked", true);
  if (error) throw new Error(`Failed to clear checked: ${error.message}`);

  await recomputePantryFlags();
  return { removed: checked.length, pantry_added: added, pantry_updated: updated };
}

/**
 * Complete the whole list: stock every item into the pantry, then clear all.
 * Mirrors `POST /shopping-list/complete`. Returns removed/pantry counts.
 */
export async function completeShopping(): Promise<ShoppingCompletionResult> {
  const items = await loadItems();
  const { added, updated } = await stockPantry(items);

  const supabase = await createClient();
  const ids = items.map((i) => i.id);
  if (ids.length) {
    const { error } = await supabase.from(TABLE).delete().in("id", ids);
    if (error) throw new Error(`Failed to complete shopping: ${error.message}`);
  }

  await recomputePantryFlags();
  return {
    removed: items.length,
    pantry_added: added,
    pantry_updated: updated,
  };
}

/**
 * Load full recipes (with ingredients) by id for the current user, validated
 * against `RecipeSchema`. Missing / non-owned ids are silently skipped, matching
 * the backend `generate` handler.
 */
async function loadRecipes(recipeIds: string[]): Promise<Recipe[]> {
  if (recipeIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(RECIPES_TABLE)
    .select("*")
    .in("id", recipeIds);

  if (error) throw new Error(`Failed to load recipes: ${error.message}`);
  return (data ?? []).map((row) => RecipeSchema.parse(row));
}

/**
 * Generate recipe-sourced items from the given recipes. Ingredients are deduped
 * and pantry-subtracted (flags computed). Mirrors `POST /shopping-list/generate`
 * + `replace_recipe_items`: previously generated `source = "recipe"` rows are
 * swapped out (manual/planner rows untouched) so re-generating doesn't pile up
 * duplicates. Returns the regenerated grouped list.
 */
export async function addFromRecipes(
  recipeIds: string[],
): Promise<ShoppingListResponse> {
  const [recipes, pantry] = await Promise.all([
    loadRecipes(recipeIds),
    loadPantryItems(),
  ]);
  const recipeItems = aggregateRecipeIngredients(recipes, pantry);

  const supabase = await createClient();
  // Remove existing recipe-sourced rows (mirrors replace_recipe_items).
  const { error: delError } = await supabase
    .from(TABLE)
    .delete()
    .eq("source", "recipe");
  if (delError)
    throw new Error(`Failed to reset recipe items: ${delError.message}`);

  if (recipeItems.length) {
    const rows = recipeItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity_text: item.quantity_text,
      aisle: item.aisle,
      checked: item.checked,
      source: item.source,
      source_recipe_id: item.source_recipe_id,
      pantry_covered: item.pantry_covered,
      pantry_low: item.pantry_low,
    }));
    const { error: insError } = await supabase.from(TABLE).insert(rows);
    if (insError)
      throw new Error(`Failed to add recipe items: ${insError.message}`);
  }

  return getShoppingList();
}

/**
 * Parse free-text lines into manual shopping items and insert them. Each
 * non-empty line becomes one item: everything up to the first "|" is the name,
 * the remainder (if any) is the quantity text. Names are normalized, aisles are
 * auto-categorized, and pantry flags are computed against the current pantry.
 * Blank lines and lines that normalize to an empty name are skipped. Returns the
 * inserted items.
 *
 * Note: there is no UI wiring today. This helper is provided per the port spec
 * and is safe to wire up later.
 */
export async function importTextList(
  lines: string[],
): Promise<ShoppingListItem[]> {
  const pantry = await loadPantryItems();
  const index = pantryIndex(pantry);
  const nowIso = new Date().toISOString();

  const items: ShoppingListItem[] = [];
  for (const line of lines) {
    const [rawName, ...rest] = line.split("|");
    const normalized = normalizeName(rawName ?? "");
    if (!normalized) continue;
    const quantity = rest.join("|").trim();
    const base: ShoppingListItem = {
      id: crypto.randomUUID(),
      name: normalized,
      quantity_text: quantity ? quantity : null,
      aisle: categorize(normalized),
      checked: false,
      source: "manual",
      source_recipe_id: null,
      pantry_covered: false,
      pantry_low: false,
      created_at: nowIso,
    };
    items.push(computePantryFlags(base, index));
  }

  if (items.length === 0) return [];

  const supabase = await createClient();
  const rows = items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity_text: item.quantity_text,
    aisle: item.aisle,
    checked: item.checked,
    source: item.source,
    source_recipe_id: item.source_recipe_id,
    pantry_covered: item.pantry_covered,
    pantry_low: item.pantry_low,
  }));
  const { data, error } = await supabase.from(TABLE).insert(rows).select("*");
  if (error) throw new Error(`Failed to import list: ${error.message}`);
  return (data ?? []).map(parseRow);
}
