import { z } from "zod";

export const PlannedMealSchema = z.object({
  id: z.string().min(1).optional(),
  day_index: z.number().int().min(0).max(6),
  recipe_id: z.string(),
  servings: z.number().positive().nullable().default(null),
});

export const MealPlanSchema = z.object({
  week_of: z.string(),
  meals: z.array(PlannedMealSchema).default([]),
  updated_at: z.string(),
});

export type PlannedMeal = z.infer<typeof PlannedMealSchema>;
export type MealPlan = z.infer<typeof MealPlanSchema>;

/** Older local plans and backups have no occurrence IDs. Keep their original positions stable on first edit. */
export function plannedMealId(plan: MealPlan, index: number): string {
  return plan.meals[index].id ?? `legacy:${plan.week_of}:${index}`;
}

export function withPlannedMealIds(plan: MealPlan): MealPlan {
  return { ...plan, meals: plan.meals.map((meal, index) => ({ ...meal, id: plannedMealId(plan, index) })) };
}
