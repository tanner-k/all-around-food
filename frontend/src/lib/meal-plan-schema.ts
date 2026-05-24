import { z } from "zod";

export const PlannedMealSchema = z.object({
  day_index: z.number().int().min(0).max(6),
  recipe_id: z.string(),
});

export const MealPlanSchema = z.object({
  week_of: z.string(),
  meals: z.array(PlannedMealSchema).default([]),
  updated_at: z.string(),
});

export type PlannedMeal = z.infer<typeof PlannedMealSchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;
