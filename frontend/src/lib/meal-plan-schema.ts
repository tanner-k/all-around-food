import { z } from "zod";

export const MealSlotSchema = z.enum(["lunch", "dinner"]);

export const PlannedMealSchema = z.object({
  day_index: z.number().int().min(0).max(6),
  slot: MealSlotSchema,
  recipe_id: z.string(),
});

export const MealPlanSchema = z.object({
  week_of: z.string(),
  meals: z.array(PlannedMealSchema).default([]),
  updated_at: z.string(),
});

export type MealSlot = z.infer<typeof MealSlotSchema>;
export type PlannedMeal = z.infer<typeof PlannedMealSchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;
