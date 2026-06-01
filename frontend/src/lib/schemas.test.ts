/**
 * @vitest-environment node
 *
 * Unit tests for the shared Zod schemas.
 * Pure — no network, no database.
 */

import { describe, it, expect } from "vitest";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  mealPlanCreateSchema,
  mealPlanUpdateSchema,
  shoppingItemCreateSchema,
  shoppingItemUpdateSchema,
  pantryItemCreateSchema,
  pantryItemUpdateSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Recipe
// ---------------------------------------------------------------------------

describe("recipeCreateSchema", () => {
  it("accepts a minimal valid recipe", () => {
    const result = recipeCreateSchema.safeParse({ title: "Pasta" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Pasta");
      expect(result.data.ingredients).toEqual([]);
      expect(result.data.steps).toEqual([]);
    }
  });

  it("accepts a full recipe with ingredients and steps", () => {
    const input = {
      title: "Chocolate Cake",
      sourceUrl: "https://example.com/cake",
      ingredients: [
        { name: "flour", amount: 250, unit: "g", position: 0 },
        { name: "sugar", amount: 200, unit: "g", position: 1 },
      ],
      steps: [
        { text: "Preheat oven to 180°C.", position: 0 },
        { text: "Mix dry ingredients.", position: 1 },
      ],
    };
    const result = recipeCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = recipeCreateSchema.safeParse({
      ingredients: [],
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string title", () => {
    const result = recipeCreateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sourceUrl", () => {
    const result = recipeCreateSchema.safeParse({
      title: "Test",
      sourceUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects step with empty text", () => {
    const result = recipeCreateSchema.safeParse({
      title: "Test",
      steps: [{ text: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount in ingredient", () => {
    const result = recipeCreateSchema.safeParse({
      title: "Test",
      ingredients: [{ name: "flour", amount: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects NaN amount in ingredient", () => {
    const result = recipeCreateSchema.safeParse({
      title: "Test",
      ingredients: [{ name: "flour", amount: NaN }],
    });
    expect(result.success).toBe(false);
  });
});

describe("recipeUpdateSchema", () => {
  it("accepts an empty object (all fields partial)", () => {
    const result = recipeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a partial update with just title", () => {
    const result = recipeUpdateSchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("still rejects empty title on update", () => {
    const result = recipeUpdateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------

describe("mealPlanCreateSchema", () => {
  it("accepts a valid meal plan entry", () => {
    const result = mealPlanCreateSchema.safeParse({
      recipeId: "550e8400-e29b-41d4-a716-446655440000",
      scheduledFor: "2026-06-15",
      mealType: "dinner",
    });
    expect(result.success).toBe(true);
  });

  it("accepts without optional mealType", () => {
    const result = mealPlanCreateSchema.safeParse({
      recipeId: "550e8400-e29b-41d4-a716-446655440000",
      scheduledFor: "2026-06-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid recipeId", () => {
    const result = mealPlanCreateSchema.safeParse({
      recipeId: "not-a-uuid",
      scheduledFor: "2026-06-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects bad date format", () => {
    const result = mealPlanCreateSchema.safeParse({
      recipeId: "550e8400-e29b-41d4-a716-446655440000",
      scheduledFor: "15-06-2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid mealType enum", () => {
    const result = mealPlanCreateSchema.safeParse({
      recipeId: "550e8400-e29b-41d4-a716-446655440000",
      scheduledFor: "2026-06-15",
      mealType: "brunch",
    });
    expect(result.success).toBe(false);
  });
});

describe("mealPlanUpdateSchema", () => {
  it("accepts empty object", () => {
    expect(mealPlanUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("still rejects invalid recipeId on update", () => {
    const result = mealPlanUpdateSchema.safeParse({ recipeId: "bad" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shopping item
// ---------------------------------------------------------------------------

describe("shoppingItemCreateSchema", () => {
  it("accepts minimal item with just name", () => {
    const result = shoppingItemCreateSchema.safeParse({ name: "Milk" });
    expect(result.success).toBe(true);
  });

  it("accepts full item", () => {
    const result = shoppingItemCreateSchema.safeParse({
      name: "Flour",
      amount: 500,
      unit: "g",
      recipeId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = shoppingItemCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid recipeId", () => {
    const result = shoppingItemCreateSchema.safeParse({
      name: "Sugar",
      recipeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = shoppingItemCreateSchema.safeParse({
      name: "Eggs",
      amount: -3,
    });
    expect(result.success).toBe(false);
  });
});

describe("shoppingItemUpdateSchema", () => {
  it("accepts toggling checked", () => {
    const result = shoppingItemUpdateSchema.safeParse({ checked: true });
    expect(result.success).toBe(true);
  });

  it("rejects empty name on update", () => {
    const result = shoppingItemUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pantry item
// ---------------------------------------------------------------------------

describe("pantryItemCreateSchema", () => {
  it("accepts minimal item", () => {
    const result = pantryItemCreateSchema.safeParse({ name: "Salt" });
    expect(result.success).toBe(true);
  });

  it("accepts full item", () => {
    const result = pantryItemCreateSchema.safeParse({
      name: "Olive oil",
      amount: 750,
      unit: "ml",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = pantryItemCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = pantryItemCreateSchema.safeParse({
      name: "Sugar",
      amount: -500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects NaN amount", () => {
    const result = pantryItemCreateSchema.safeParse({
      name: "Sugar",
      amount: NaN,
    });
    expect(result.success).toBe(false);
  });
});

describe("pantryItemUpdateSchema", () => {
  it("accepts empty object", () => {
    expect(pantryItemUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = pantryItemUpdateSchema.safeParse({ amount: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects empty name on update", () => {
    const result = pantryItemUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
