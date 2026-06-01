/**
 * Shared Zod schemas + inferred TypeScript types.
 *
 * NO server-only imports — this file is safe to import from client components
 * (the types are used by lib/api.ts which runs in the browser).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Bounds constants (exported so tests can reference them directly)
// ---------------------------------------------------------------------------

export const BOUNDS = {
  // String field max lengths
  RECIPE_TITLE_MAX: 500,
  INGREDIENT_NAME_MAX: 200,
  INGREDIENT_UNIT_MAX: 100,
  INGREDIENT_NOTES_MAX: 500,
  STEP_TEXT_MAX: 5_000,
  SOURCE_URL_MAX: 2_048,
  ITEM_NAME_MAX: 200,
  ITEM_UNIT_MAX: 100,

  // Array size caps
  INGREDIENTS_MAX: 200,
  STEPS_MAX: 100,

  // Number ranges
  AMOUNT_MAX: 1_000_000,
} as const;

// ---------------------------------------------------------------------------
// Recipe schemas
// ---------------------------------------------------------------------------

export const ingredientCreateSchema = z.object({
  name: z.string().min(1).max(BOUNDS.INGREDIENT_NAME_MAX),
  amount: z
    .number()
    .positive()
    .finite()
    .max(BOUNDS.AMOUNT_MAX)
    .optional(),
  unit: z.string().max(BOUNDS.INGREDIENT_UNIT_MAX).optional(),
  notes: z.string().max(BOUNDS.INGREDIENT_NOTES_MAX).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const stepCreateSchema = z.object({
  text: z.string().min(1).max(BOUNDS.STEP_TEXT_MAX),
  position: z.number().int().nonnegative().optional(),
});

export const recipeCreateSchema = z.object({
  title: z.string().min(1).max(BOUNDS.RECIPE_TITLE_MAX),
  sourceUrl: z
    .string()
    .url()
    .max(BOUNDS.SOURCE_URL_MAX)
    .refine((u) => {
      try {
        const p = new URL(u);
        return p.protocol === "http:" || p.protocol === "https:";
      } catch {
        return false;
      }
    }, "sourceUrl must use http or https")
    .optional(),
  ingredients: z
    .array(ingredientCreateSchema)
    .max(BOUNDS.INGREDIENTS_MAX)
    .default([]),
  steps: z
    .array(stepCreateSchema)
    .max(BOUNDS.STEPS_MAX)
    .default([]),
});

export const recipeUpdateSchema = recipeCreateSchema.partial();

export type IngredientCreate = z.infer<typeof ingredientCreateSchema>;
export type StepCreate = z.infer<typeof stepCreateSchema>;
export type RecipeCreate = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdate = z.infer<typeof recipeUpdateSchema>;

// ---------------------------------------------------------------------------
// Meal plan schemas
// ---------------------------------------------------------------------------

export const mealTypeEnum = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const mealPlanCreateSchema = z.object({
  recipeId: z.string().uuid(),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  mealType: mealTypeEnum.optional(),
});

export const mealPlanUpdateSchema = mealPlanCreateSchema.partial();

export type MealPlanCreate = z.infer<typeof mealPlanCreateSchema>;
export type MealPlanUpdate = z.infer<typeof mealPlanUpdateSchema>;

// ---------------------------------------------------------------------------
// Shopping list schemas
// ---------------------------------------------------------------------------

export const shoppingItemCreateSchema = z.object({
  name: z.string().min(1).max(BOUNDS.ITEM_NAME_MAX),
  amount: z.number().positive().finite().max(BOUNDS.AMOUNT_MAX).optional(),
  unit: z.string().max(BOUNDS.ITEM_UNIT_MAX).optional(),
  recipeId: z.string().uuid().optional(),
});

export const shoppingItemUpdateSchema = z.object({
  name: z.string().min(1).max(BOUNDS.ITEM_NAME_MAX).optional(),
  amount: z.number().positive().finite().max(BOUNDS.AMOUNT_MAX).optional(),
  unit: z.string().max(BOUNDS.ITEM_UNIT_MAX).optional(),
  checked: z.boolean().optional(),
});

export type ShoppingItemCreate = z.infer<typeof shoppingItemCreateSchema>;
export type ShoppingItemUpdate = z.infer<typeof shoppingItemUpdateSchema>;

// ---------------------------------------------------------------------------
// Pantry item schemas
// ---------------------------------------------------------------------------

export const pantryItemCreateSchema = z.object({
  name: z.string().min(1).max(BOUNDS.ITEM_NAME_MAX),
  amount: z.number().positive().finite().max(BOUNDS.AMOUNT_MAX).optional(),
  unit: z.string().max(BOUNDS.ITEM_UNIT_MAX).optional(),
});

export const pantryItemUpdateSchema = pantryItemCreateSchema.partial();

export type PantryItemCreate = z.infer<typeof pantryItemCreateSchema>;
export type PantryItemUpdate = z.infer<typeof pantryItemUpdateSchema>;
