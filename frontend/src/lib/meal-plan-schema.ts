import { z } from "zod";

export const PlannedMealSchema = z.object({
  id: z.string().min(1).optional(),
  position: z.number().int().nonnegative().safe().optional(),
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
  return { ...plan, meals: plan.meals.map((meal, index) => ({ ...meal, id: plannedMealId(plan, index), position: meal.position ?? index })) };
}

/** Individual wire occurrences; meal_plans remains the local weekly projection. */
export const PlannedOccurrenceSchema = PlannedMealSchema.extend({
  id: z.string().min(1),
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  position: z.number().int().nonnegative().safe(),
});
export type PlannedOccurrence = z.infer<typeof PlannedOccurrenceSchema>;
export function plannedOccurrences(plan: MealPlan): PlannedOccurrence[] {
  return withPlannedMealIds(plan).meals.map(meal => PlannedOccurrenceSchema.parse({ ...meal, week_of: plan.week_of }));
}
