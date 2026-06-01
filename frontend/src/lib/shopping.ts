/**
 * Pure helper — maps a recipe's ingredients to ShoppingItemCreate payloads.
 *
 * No server imports; safe to call from client components.
 */

import type { RecipeIngredient } from "./api";
import type { ShoppingItemCreate } from "./schemas";

/**
 * Convert a recipe's ingredients array into shopping-list create payloads.
 *
 * Each ingredient becomes a shopping item carrying:
 * - `name`      — ingredient name (trimmed)
 * - `amount`    — optional positive number
 * - `unit`      — optional unit string
 * - `recipeId`  — the source recipe UUID (for traceability)
 *
 * Ingredients with empty names are silently dropped.
 */
export function recipeToShoppingItems(
  recipeId: string,
  ingredients: RecipeIngredient[],
): ShoppingItemCreate[] {
  return ingredients
    .filter((ing) => ing.name.trim().length > 0)
    .map((ing): ShoppingItemCreate => {
      const item: ShoppingItemCreate = {
        name: ing.name.trim(),
        recipeId,
      };
      if (ing.amount !== null && ing.amount !== undefined) {
        item.amount = ing.amount;
      }
      if (ing.unit !== null && ing.unit !== undefined && ing.unit.trim().length > 0) {
        item.unit = ing.unit.trim();
      }
      return item;
    });
}
