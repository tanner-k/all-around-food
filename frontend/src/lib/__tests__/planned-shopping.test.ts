import { describe, expect, it } from "vitest";

import { MealPlanSchema, type MealPlan } from "@/lib/meal-plan-schema";
import { PantryItemSchema, type PantryItem } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { aggregatePlannedIngredients } from "@/lib/shopping-logic";

function recipe(input: Partial<Recipe> & Pick<Recipe, "id" | "ingredients">): Recipe {
  const { id, ingredients, ...overrides } = input;
  return RecipeSchema.parse({
    title: "Recipe",
    description: null,
    source_url: null,
    source_attribution: null,
    prep_time_min: null,
    cook_time_min: null,
    total_time_min: null,
    servings: 2,
    yield_text: null,
    steps: [{ order: 1, instruction: "Cook.", duration_min: null, temperature_f: null }],
    equipment: [],
    cuisine: null,
    course: null,
    dietary_tags: [],
    difficulty: null,
    nutrition: null,
    notes: null,
    storage_instructions: null,
    created_at: "2026-09-20T00:00:00.000Z",
    times_made: 0,
    parse_confidence: null,
    ...overrides,
    id,
    ingredients,
  });
}

function plan(meals: MealPlan["meals"]): MealPlan {
  return MealPlanSchema.parse({
    week_of: "2026-09-21",
    meals,
    updated_at: "2026-09-20T00:00:00.000Z",
  });
}

function pantry(name: string, status: PantryItem["status"]): PantryItem {
  return PantryItemSchema.parse({
    id: name,
    name,
    status,
    aisle: "Other",
    aisle_overridden: false,
    notes: null,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
  });
}

describe("aggregatePlannedIngredients", () => {
  it("keeps repeated planned recipe occurrences and creates stable weekly IDs", () => {
    const recipes = [
      recipe({
        id: "eggs",
        ingredients: [
          {
            name: "Eggs",
            quantity: { value: 2, unit: "eggs", as_written: "2 eggs" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
        ],
      }),
    ];
    const weeklyPlan = plan([
      { day_index: 0, recipe_id: "eggs", servings: null },
      { day_index: 1, recipe_id: "eggs", servings: null },
    ]);

    const first = aggregatePlannedIngredients(weeklyPlan, recipes, []);
    const second = aggregatePlannedIngredients(weeklyPlan, recipes, []);
    const changedDemand = aggregatePlannedIngredients(
      plan([{ day_index: 0, recipe_id: "eggs", servings: 3 }]),
      recipes,
      [],
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      name: "eggs",
      quantity_text: "4 eggs",
      generated_week_of: "2026-09-21",
      source: "planner",
      checked: false,
      needs_review: false,
    });
    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.id).not.toBe(changedDemand[0]?.id);
  });

  it("scales planned servings and combines compatible unit aliases", () => {
    const recipes = [
      recipe({
        id: "bread",
        ingredients: [
          {
            name: "Flour",
            quantity: { value: 0.5, unit: "kilograms", as_written: "0.5 kg" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "flour",
            quantity: { value: 250, unit: "grams", as_written: "250 g" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Salt",
            quantity: { value: 1, unit: "tbsp", as_written: "1 tbsp" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "salt",
            quantity: { value: 2, unit: "teaspoons", as_written: "2 tsp" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Oil",
            quantity: { value: 1, unit: "L", as_written: "1 L" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "oil",
            quantity: { value: 250, unit: "milliliters", as_written: "250 mL" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Nuts",
            quantity: { value: 1, unit: "lb", as_written: "1 lb" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "nuts",
            quantity: { value: 8, unit: "ounces", as_written: "8 oz" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
        ],
      }),
    ];

    const items = aggregatePlannedIngredients(
      plan([{ day_index: 0, recipe_id: "bread", servings: 4 }]),
      recipes,
      [],
    );

    expect(items.find((item) => item.name === "flour")?.quantity_text).toBe("1500 g");
    expect(items.find((item) => item.name === "salt")?.quantity_text).toBe("10 tsp");
    expect(items.find((item) => item.name === "oil")?.quantity_text).toBe("2500 mL");
    expect(items.find((item) => item.name === "nuts")?.quantity_text).toBe("48 oz");
  });

  it("keeps incomparable and repeated unknown quantities as separate readable terms", () => {
    const recipes = [
      recipe({
        id: "soup",
        ingredients: [
          {
            name: "Milk",
            quantity: { value: 1, unit: "cup", as_written: "1 cup" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "milk",
            quantity: { value: 250, unit: "mL", as_written: "250 mL" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Pepper",
            quantity: { value: null, unit: null, as_written: "to taste" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "pepper",
            quantity: { value: null, unit: null, as_written: "to taste" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Parsley",
            quantity: { value: 1, unit: "bunch", as_written: "1 bunch" },
            preparation: null,
            optional: true,
            group: null,
            notes: null,
          },
        ],
      }),
    ];

    const items = aggregatePlannedIngredients(
      plan([{ day_index: 0, recipe_id: "soup", servings: null }]),
      recipes,
      [],
    );

    expect(items.find((item) => item.name === "milk")?.quantity_text).toBe("1 cup + 250 mL");
    expect(items.find((item) => item.name === "pepper")?.quantity_text).toBe(
      "to taste + to taste",
    );
    expect(items.find((item) => item.name === "parsley")).toBeUndefined();
  });

  it("marks unscalable serving demand for review and applies pantry coverage", () => {
    const recipes = [
      recipe({
        id: "unknown-yield",
        servings: null,
        ingredients: [
          {
            name: "Eggs",
            quantity: { value: 2, unit: "egg", as_written: "2 eggs" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Milk",
            quantity: { value: 1, unit: "cup", as_written: "1 cup" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
          {
            name: "Flour",
            quantity: { value: 1, unit: "cup", as_written: "1 cup" },
            preparation: null,
            optional: false,
            group: null,
            notes: null,
          },
        ],
      }),
    ];
    const items = aggregatePlannedIngredients(
      plan([{ day_index: 0, recipe_id: "unknown-yield", servings: 4 }]),
      recipes,
      [pantry("eggs", "in_stock"), pantry("milk", "low"), pantry("flour", "out")],
    );

    expect(items.find((item) => item.name === "eggs")).toMatchObject({
      quantity_text: "2 eggs",
      needs_review: true,
      pantry_covered: true,
      pantry_low: false,
    });
    expect(items.find((item) => item.name === "milk")).toMatchObject({
      pantry_covered: false,
      pantry_low: true,
    });
    expect(items.find((item) => item.name === "flour")).toMatchObject({
      pantry_covered: false,
      pantry_low: false,
    });
  });
});
