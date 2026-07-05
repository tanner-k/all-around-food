// Server-only data-access layer for pantry items, backed by Supabase.
//
// RLS scopes every query to the signed-in user via the cookie-bound server
// client — do NOT pass a service-role key here. The `pantry_items` table
// columns mirror the `PantryItem` type, plus a `user_id` column that the DB
// fills from `auth.uid()` on insert (so we never set it here). `id` is a text
// PK with no DB default, so inserts generate one client-side.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  PantryItemSchema,
  AisleSchema,
  type Aisle,
  type PantryItem,
  type PantryStatus,
} from "@/lib/pantry-schema";
import { normalizeName } from "@/lib/normalize";

const TABLE = "pantry_items";

// Columns a caller is allowed to write. `id`, `user_id`, `created_at`, and
// `updated_at` are managed here / by the DB and are never taken from input.
const EDITABLE_COLUMNS = ["name", "aisle", "notes", "aisle_overridden"] as const;

// ── Aisle categorization ────────────────────────────────────────────────────
// Ported from backend/src/allaroundfood/aisles.py so new pantry items get the
// same auto-assigned aisle the FastAPI backend produced. Keep in sync.

const AISLE_ORDER: Aisle[] = [
  "Produce",
  "Dairy",
  "Meat",
  "Bakery",
  "Pantry",
  "Frozen",
  "Beverages",
  "Household",
  "Other",
];

const AISLE_KEYWORDS: Partial<Record<Aisle, string[]>> = {
  Produce: [
    "lettuce", "tomato", "onion", "garlic", "carrot", "celery", "spinach",
    "kale", "apple", "banana", "lemon", "lime", "orange", "berry", "grape",
    "cilantro", "parsley", "basil", "herb", "potato", "avocado", "broccoli",
    "cauliflower", "cucumber", "mushroom", "zucchini", "bell pepper", "ginger",
    "scallion", "corn",
  ],
  Dairy: [
    "milk", "butter", "cheese", "yogurt", "cream", "egg", "parmesan",
    "mozzarella", "feta", "ricotta",
  ],
  Meat: [
    "chicken", "beef", "pork", "bacon", "sausage", "turkey", "lamb", "fish",
    "salmon", "tuna", "shrimp", "steak",
  ],
  Bakery: [
    "bread", "bun", "bagel", "tortilla", "roll", "baguette", "croissant",
    "pita",
  ],
  Pantry: [
    "flour", "sugar", "rice", "pasta", "noodle", "oil", "vinegar", "salt",
    "pepper", "spice", "bean", "lentil", "broth", "stock", "sauce", "ketchup",
    "mustard", "mayonnaise", "can", "oats", "cereal", "honey", "syrup",
    "baking", "yeast", "nut", "peanut",
  ],
  Frozen: ["frozen", "ice cream", "popsicle"],
  Beverages: [
    "orange juice", "juice", "soda", "coffee", "tea", "sparkling water",
    "wine", "beer",
  ],
  Household: [
    "paper towel", "toilet paper", "detergent", "soap", "dish soap", "foil",
    "plastic wrap", "trash bag", "napkin",
  ],
};

/**
 * Categorize a grocery item name into an aisle by keyword match. Lowercases
 * the name and substring-checks every aisle's keywords; the aisle whose
 * longest matching keyword is longest wins (so "ice cream" beats "cream").
 * Ties break by AISLE_ORDER. Unmatched names fall back to "Other". Mirrors the
 * backend `categorize()`.
 */
function categorize(name: string): Aisle {
  const lowered = name.toLowerCase();
  let bestAisle: Aisle = "Other";
  let bestLen = 0;
  for (const aisle of AISLE_ORDER) {
    for (const keyword of AISLE_KEYWORDS[aisle] ?? []) {
      if (lowered.includes(keyword) && keyword.length > bestLen) {
        bestLen = keyword.length;
        bestAisle = aisle;
      }
    }
  }
  return bestAisle;
}

// ── Row parsing ─────────────────────────────────────────────────────────────

/**
 * Validate a raw DB row against the PantryItem schema. `timestamptz` columns
 * come back as ISO strings and extra columns (like `user_id`) are ignored by
 * the schema.
 */
function parseRow(row: unknown): PantryItem {
  return PantryItemSchema.parse(row);
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** All of the current user's pantry items, ordered by name. */
export async function listPantryItems(): Promise<PantryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to list pantry items: ${error.message}`);
  return (data ?? []).map(parseRow);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Add a pantry item from a name. Normalizes the name, generates an id, and
 * auto-categorizes the aisle — mirrors the backend `POST /pantry`. `user_id`
 * is filled by the DB from `auth.uid()`. Returns the inserted item.
 */
export async function addPantryItem(name: string): Promise<PantryItem> {
  const normalized = normalizeName(name);
  if (!normalized) throw new Error("Item name is required");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      id: crypto.randomUUID(),
      name: normalized,
      status: "in_stock" satisfies PantryStatus,
      aisle: categorize(normalized),
      aisle_overridden: false,
      notes: null,
    })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to add pantry item: ${error.message}`);
  if (!data) throw new Error("Failed to add pantry item");
  return parseRow(data);
}

/** Update only a pantry item's stock status. Returns the updated item. */
export async function updatePantryStatus(
  id: string,
  status: PantryStatus,
): Promise<PantryItem> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update status: ${error.message}`);
  if (!data) throw new Error("Pantry item not found");
  return parseRow(data);
}

export interface PantryItemPatch {
  name?: string;
  aisle?: Aisle;
  notes?: string | null;
}

/**
 * Update the editable fields of a pantry item (name / aisle / notes). Mirrors
 * the backend `PUT /pantry/{id}`: normalizes the name and sets
 * `aisle_overridden = true` when the aisle is changed to a value different from
 * the stored one, so future auto-categorization won't clobber the manual
 * choice. Returns the updated item.
 */
export async function updatePantryItem(
  id: string,
  patch: PantryItemPatch,
): Promise<PantryItem> {
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select("aisle, aisle_overridden")
    .eq("id", id)
    .maybeSingle();

  if (readError)
    throw new Error(`Failed to read pantry item: ${readError.message}`);
  if (!existing) throw new Error("Pantry item not found");

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) {
    const normalized = normalizeName(patch.name);
    if (!normalized) throw new Error("Item name is required");
    update.name = normalized;
  }

  if (patch.aisle !== undefined) {
    const aisle = AisleSchema.parse(patch.aisle);
    update.aisle = aisle;
    // Manual aisle change (to a different value) locks it as overridden.
    if (aisle !== existing.aisle || existing.aisle_overridden) {
      update.aisle_overridden = true;
    }
  }

  if (patch.notes !== undefined) {
    update.notes = patch.notes;
  }

  // Guard against writing anything outside the allowed set.
  for (const key of Object.keys(update)) {
    if (
      key !== "updated_at" &&
      !(EDITABLE_COLUMNS as readonly string[]).includes(key)
    ) {
      delete update[key];
    }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update pantry item: ${error.message}`);
  if (!data) throw new Error("Pantry item not found");
  return parseRow(data);
}

/** Delete a pantry item by id. */
export async function deletePantryItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`Failed to delete pantry item: ${error.message}`);
}
