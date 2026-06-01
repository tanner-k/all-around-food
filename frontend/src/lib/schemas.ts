/**
 * Shared Zod schemas + inferred TypeScript types.
 *
 * NO server-only imports — this file is safe to import from client components
 * (the types are used by lib/api.ts which runs in the browser).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Recipe schemas
// ---------------------------------------------------------------------------

export const ingredientCreateSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive().optional(),
  unit: z.string().optional(),
  notes: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const stepCreateSchema = z.object({
  text: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
});

export const recipeCreateSchema = z.object({
  title: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  ingredients: z.array(ingredientCreateSchema).default([]),
  steps: z.array(stepCreateSchema).default([]),
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
  name: z.string().min(1),
  amount: z.number().positive().optional(),
  unit: z.string().optional(),
  recipeId: z.string().uuid().optional(),
});

export const shoppingItemUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  unit: z.string().optional(),
  checked: z.boolean().optional(),
});

export type ShoppingItemCreate = z.infer<typeof shoppingItemCreateSchema>;
export type ShoppingItemUpdate = z.infer<typeof shoppingItemUpdateSchema>;

// ---------------------------------------------------------------------------
// Pantry item schemas
// ---------------------------------------------------------------------------

export const pantryItemCreateSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive().optional(),
  unit: z.string().optional(),
});

export const pantryItemUpdateSchema = pantryItemCreateSchema.partial();

export type PantryItemCreate = z.infer<typeof pantryItemCreateSchema>;
export type PantryItemUpdate = z.infer<typeof pantryItemUpdateSchema>;
