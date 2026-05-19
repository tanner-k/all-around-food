import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const QuantitySchema = z.object({
  value: z.number().nullable(),
  unit: z.string().nullable(),
  as_written: z.string(),
});

export const IngredientSchema = z.object({
  name: z.string(),
  quantity: QuantitySchema,
  preparation: z.string().nullable(),
  optional: z.boolean().default(false),
  group: z.string().nullable(),
  notes: z.string().nullable(),
});

export const StepSchema = z.object({
  order: z.number().int(),
  instruction: z.string(),
  duration_min: z.number().nullable(),
  temperature_f: z.number().int().nullable(),
  equipment: z.array(z.string()).default([]),
  inline_amounts: z.array(z.string()).default([]),
});

export const NutritionSchema = z.object({
  kcal: z.number().int().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
});

export const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  source_url: z.string().nullable(),
  source_attribution: z.string().nullable(),
  prep_time_min: z.number().int().nullable(),
  cook_time_min: z.number().int().nullable(),
  total_time_min: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  yield_text: z.string().nullable(),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(StepSchema).min(1),
  equipment: z.array(z.string()).default([]),
  cuisine: z.string().nullable(),
  course: z.string().nullable(),
  dietary_tags: z.array(z.string()).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  nutrition: NutritionSchema.nullable(),
  notes: z.string().nullable(),
  storage_instructions: z.string().nullable(),
  created_at: z.string(),
  times_made: z.number().int().default(0),
  parse_confidence: z.number().min(0).max(1).nullable(),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Step = z.infer<typeof StepSchema>;

// Inline schema (no $ref wrapper) — Anthropic tool input_schema requires this shape.
const _rawRecipeSchema = zodToJsonSchema(RecipeSchema) as Record<string, unknown>;
delete _rawRecipeSchema.$schema;
export const recipeJsonSchema = _rawRecipeSchema;
