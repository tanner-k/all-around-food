import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";

export function recipeFixture(): Recipe {
  return RecipeSchema.parse({
    id: "recipe-1",
    title: "Toast",
    description: null,
    source_url: null,
    source_attribution: null,
    prep_time_min: null,
    cook_time_min: null,
    total_time_min: null,
    servings: 1,
    yield_text: null,
    ingredients: [
      {
        name: "bread",
        quantity: { value: 2, unit: "slice", as_written: "2 slices" },
        preparation: null,
        group: null,
        notes: null,
      },
    ],
    steps: [
      {
        order: 1,
        instruction: "Toast the bread.",
        duration_min: null,
        temperature_f: null,
      },
    ],
    cuisine: null,
    course: null,
    difficulty: null,
    nutrition: null,
    notes: null,
    storage_instructions: null,
    created_at: "2026-09-19T12:00:00Z",
    parse_confidence: null,
  });
}
