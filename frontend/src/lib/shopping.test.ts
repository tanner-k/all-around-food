/**
 * Unit tests for recipeToShoppingItems — pure function, no network/db.
 */

import { describe, it, expect } from "vitest";
import { recipeToShoppingItems } from "./shopping";
import type { RecipeIngredient } from "./api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIngredient(
  overrides: Partial<RecipeIngredient> & { name: string },
): RecipeIngredient {
  return {
    id: "ing-1",
    recipeId: "recipe-abc",
    amount: null,
    unit: null,
    notes: null,
    position: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recipeToShoppingItems", () => {
  it("returns an empty array for empty ingredients", () => {
    const result = recipeToShoppingItems("recipe-abc", []);
    expect(result).toEqual([]);
  });

  it("maps ingredient names to shopping item names", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "olive oil" }),
      makeIngredient({ id: "i2", name: "garlic" }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("olive oil");
    expect(result[1].name).toBe("garlic");
  });

  it("carries amount when present", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "flour", amount: 2 }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result[0].amount).toBe(2);
  });

  it("carries unit when present", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "flour", amount: 2, unit: "cups" }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result[0].unit).toBe("cups");
  });

  it("sets recipeId on all items", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "eggs" }),
      makeIngredient({ id: "i2", name: "butter" }),
    ];
    const result = recipeToShoppingItems("recipe-xyz", ingredients);
    expect(result[0].recipeId).toBe("recipe-xyz");
    expect(result[1].recipeId).toBe("recipe-xyz");
  });

  it("omits amount when null", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "salt", amount: null }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result[0].amount).toBeUndefined();
  });

  it("omits unit when null", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "salt", unit: null }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result[0].unit).toBeUndefined();
  });

  it("filters out ingredients with empty names", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "" }),
      makeIngredient({ id: "i2", name: "   " }),
      makeIngredient({ id: "i3", name: "basil" }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("basil");
  });

  it("trims whitespace from ingredient names", () => {
    const ingredients = [
      makeIngredient({ id: "i1", name: "  cherry tomatoes  " }),
    ];
    const result = recipeToShoppingItems("recipe-abc", ingredients);
    expect(result[0].name).toBe("cherry tomatoes");
  });

  it("handles a full ingredient list with mixed amounts/units", () => {
    const ingredients: RecipeIngredient[] = [
      { id: "i1", recipeId: "r1", name: "gnocchi", amount: 1, unit: "lb", notes: null, position: 0 },
      { id: "i2", recipeId: "r1", name: "cherry tomatoes", amount: 2, unit: "cups", notes: null, position: 1 },
      { id: "i3", recipeId: "r1", name: "garlic", amount: 3, unit: null, notes: "cloves", position: 2 },
      { id: "i4", recipeId: "r1", name: "olive oil", amount: null, unit: null, notes: null, position: 3 },
    ];
    const result = recipeToShoppingItems("r1", ingredients);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ name: "gnocchi", amount: 1, unit: "lb", recipeId: "r1" });
    expect(result[1]).toMatchObject({ name: "cherry tomatoes", amount: 2, unit: "cups", recipeId: "r1" });
    expect(result[2]).toMatchObject({ name: "garlic", amount: 3, recipeId: "r1" });
    expect(result[2].unit).toBeUndefined();
    expect(result[3]).toMatchObject({ name: "olive oil", recipeId: "r1" });
    expect(result[3].amount).toBeUndefined();
  });
});
