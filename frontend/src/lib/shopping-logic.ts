// Pure, unit-testable shopping-list logic, ported from the FastAPI backend:
//   - aisles.py       → AISLE_KEYWORDS / AISLE_ORDER / categorize()
//   - naming.py       → normalizeName() (re-exported from @/lib/normalize)
//   - shopping_logic.py → computePantryFlags / aggregateRecipeIngredients /
//                         buildShoppingListResponse
//
// These functions have no I/O and no Supabase dependency — the data-access
// layer (src/lib/db/shopping.ts) composes them around DB reads/writes. Keep in
// behavioural sync with the backend so the app produces the same lists the
// FastAPI service did.

import { normalizeName } from "@/lib/normalize";
import type { Aisle, PantryItem } from "@/lib/pantry-schema";
import type {
  ShoppingListItem,
  ShoppingListResponse,
} from "@/lib/shopping-schema";
import type { Recipe } from "@/lib/recipe-schema";

// Re-export so callers/tests can import name-normalization alongside the rest of
// the shopping logic. Single source of truth lives in @/lib/normalize.
export { normalizeName };

// ── Aisle categorization (ported from aisles.py) ────────────────────────────

// Aisle -> keyword list. categorize() picks the aisle whose longest matching
// keyword is longest, so specific compounds ("ice cream") beat broad keywords
// ("cream"). Ties break by AISLE_ORDER.
export const AISLE_KEYWORDS: Partial<Record<Aisle, readonly string[]>> = {
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

// Display/grouping order for aisles, with the catch-all last.
export const AISLE_ORDER: readonly Aisle[] = [
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

/**
 * Categorize a grocery item name into an aisle by keyword match.
 *
 * Lowercases the name and substring-checks every aisle's keywords. The aisle
 * whose longest matching keyword is longest wins, so specific compounds
 * ("ice cream") beat broad keywords ("cream"). Ties break by AISLE_ORDER
 * (iteration order). Unmatched names fall back to "Other". Mirrors the backend
 * `categorize()`.
 */
export function categorize(name: string): Aisle {
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

// ── Pantry flags (ported from shopping_logic.py) ────────────────────────────

/**
 * Build a normalized-name -> PantryItem lookup. Mirrors `_pantry_index`.
 */
export function pantryIndex(
  pantryItems: PantryItem[],
): Map<string, PantryItem> {
  const index = new Map<string, PantryItem>();
  for (const item of pantryItems) {
    index.set(normalizeName(item.name), item);
  }
  return index;
}

/**
 * Return a copy of `item` with pantry flags recomputed against the supplied
 * normalized-name -> PantryItem lookup. An `in_stock` match marks the item as
 * covered; a `low` match flags it as low; `out` or no match leaves it a plain
 * to-buy item. Mirrors `compute_pantry_flags`.
 */
export function computePantryFlags(
  item: ShoppingListItem,
  pantryByName: Map<string, PantryItem>,
): ShoppingListItem {
  const match = pantryByName.get(normalizeName(item.name));
  let covered = false;
  let low = false;
  if (match === undefined || match.status === "out") {
    covered = false;
    low = false;
  } else if (match.status === "in_stock") {
    covered = true;
    low = false;
  } else {
    // low
    covered = false;
    low = true;
  }
  return { ...item, pantry_covered: covered, pantry_low: low };
}

/**
 * Recompute pantry flags for every shopping-list item. Mirrors
 * `recompute_all_flags`.
 */
export function recomputeAllFlags(
  shoppingItems: ShoppingListItem[],
  pantryItems: PantryItem[],
): ShoppingListItem[] {
  const index = pantryIndex(pantryItems);
  return shoppingItems.map((item) => computePantryFlags(item, index));
}

// ── Recipe aggregation (ported from shopping_logic.py) ──────────────────────

interface Aggregated {
  quantities: string[];
  sourceRecipeId: string | null;
}

/** Minimal factory for a recipe-sourced item id. Mirrors `str(uuid.uuid4())`. */
function newId(): string {
  return crypto.randomUUID();
}

/**
 * Aggregate recipe ingredients into deduped shopping-list items. Optional
 * ingredients are skipped. Ingredients are deduped by normalized name; distinct
 * `quantity.as_written` strings are joined with " + " (no numeric summation —
 * units are not normalized). Pantry flags are computed against the supplied
 * pantry. Mirrors `aggregate_recipe_ingredients`.
 *
 * The returned items carry `checked: false`, `source: "recipe"`, and a fresh
 * `created_at` ISO timestamp so they are ready to insert into
 * `shopping_list_items`.
 */
export function aggregateRecipeIngredients(
  recipes: Recipe[],
  pantryItems: PantryItem[],
): ShoppingListItem[] {
  const index = pantryIndex(pantryItems);
  // Map preserves insertion order, matching Python dict iteration.
  const accumulated = new Map<string, Aggregated>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.optional) continue;
      const key = normalizeName(ingredient.name);
      if (!key) continue;
      let entry = accumulated.get(key);
      if (entry === undefined) {
        entry = { quantities: [], sourceRecipeId: null };
        accumulated.set(key, entry);
      }
      if (entry.sourceRecipeId === null) {
        entry.sourceRecipeId = recipe.id;
      }
      const qty = ingredient.quantity.as_written.trim();
      if (qty && !entry.quantities.includes(qty)) {
        entry.quantities.push(qty);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const items: ShoppingListItem[] = [];
  for (const [name, entry] of accumulated) {
    const base: ShoppingListItem = {
      id: newId(),
      name,
      quantity_text: entry.quantities.length
        ? entry.quantities.join(" + ")
        : null,
      aisle: categorize(name),
      checked: false,
      source: "recipe",
      source_recipe_id: entry.sourceRecipeId,
      pantry_covered: false,
      pantry_low: false,
      created_at: nowIso,
    };
    items.push(computePantryFlags(base, index));
  }
  return items;
}

// ── Grouped response (ported from shopping_logic.py) ────────────────────────

/**
 * Build the grouped-by-aisle shopping-list response. Every item is included
 * regardless of pantry state (pantry-covered/low items stay on the list so it
 * doubles as a pantry check — their stock status rides on the
 * `pantry_covered`/`pantry_low` flags). Aisles are emitted in AISLE_ORDER,
 * empty aisles are dropped, and items within an aisle are sorted by name.
 * Mirrors `build_shopping_list_response`.
 */
export function buildShoppingListResponse(
  items: ShoppingListItem[],
): ShoppingListResponse {
  const groups = [];
  for (const aisle of AISLE_ORDER) {
    const aisleItems = items
      .filter((i) => i.aisle === aisle)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (aisleItems.length) {
      groups.push({ aisle, items: aisleItems });
    }
  }
  return { groups, total_visible: items.length };
}
