"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFromRecipesAction } from "@/app/(app)/shop/actions";
import {
  addPlannedMealAction,
  removePlannedMealAction,
} from "@/app/(app)/plan/actions";
import type { MealPlan, PlannedMeal } from "@/lib/meal-plan-schema";
import { formatMonthDay, weekDays } from "@/lib/week";
import { DayColumn } from "./DayColumn";
import { RecipePickerModal } from "./RecipePickerModal";

interface RecipeOption {
  id: string;
  title: string;
}

interface PlanViewProps {
  weekOf: string;
  initialPlan: MealPlan;
  recipes: RecipeOption[];
}

export function PlanView({ weekOf, initialPlan, recipes }: PlanViewProps) {
  const router = useRouter();
  const [meals, setMeals] = useState<PlannedMeal[]>(initialPlan.meals);
  const [picker, setPicker] = useState<{ dayIndex: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const titleById = new Map(recipes.map((r) => [r.id, r.title]));
  const days = weekDays(weekOf);

  function mealsForDay(
    dayIndex: number
  ): { title: string; recipeId: string }[] {
    return meals.flatMap((meal) =>
      meal.day_index === dayIndex
        ? [
            {
              title: titleById.get(meal.recipe_id) ?? "Unknown recipe",
              recipeId: meal.recipe_id,
            },
          ]
        : []
    );
  }

  async function handlePick(recipeId: string) {
    if (!picker) return;
    const dayIndex = picker.dayIndex;
    setPicker(null);
    // The planned-meal id collapses duplicate (day, recipe) pairs, so adding
    // the same recipe to the same day is a no-op — reflect that optimistically.
    const already = meals.some(
      (m) => m.day_index === dayIndex && m.recipe_id === recipeId
    );
    if (already) return;

    const previous = meals;
    const next: PlannedMeal[] = [
      ...meals,
      { day_index: dayIndex, recipe_id: recipeId },
    ];
    setMeals(next);
    setError(null);
    const result = await addPlannedMealAction(weekOf, dayIndex, recipeId);
    if ("error" in result) {
      setMeals(previous);
      setError(result.error);
    }
  }

  async function handleRemove(dayIndex: number, recipeId: string) {
    const previous = meals;
    setMeals(
      meals.filter(
        (m) => !(m.day_index === dayIndex && m.recipe_id === recipeId)
      )
    );
    setError(null);
    const result = await removePlannedMealAction(weekOf, dayIndex, recipeId);
    if ("error" in result) {
      setMeals(previous);
      setError(result.error);
    }
  }

  async function handleReviewShopping() {
    if (meals.length === 0 || reviewing) return;
    setReviewing(true);
    setError(null);
    const recipeIds = [...new Set(meals.map((m) => m.recipe_id))];
    const result = await addFromRecipesAction(recipeIds);
    if (result.ok) {
      router.push("/shop");
    } else {
      setError(result.error);
    }
    setReviewing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-mute">
        Week of {formatMonthDay(weekOf)} · {meals.length}{" "}
        {meals.length === 1 ? "recipe" : "recipes"} planned
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <DayColumn
            key={day.index}
            day={day}
            meals={mealsForDay(day.index)}
            onAdd={(dayIndex) => setPicker({ dayIndex })}
            onRemove={(dayIndex, recipeId) =>
              void handleRemove(dayIndex, recipeId)
            }
          />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-ink-mute">
          Plan your week, then turn it into a shopping list.
        </p>
        <button
          type="button"
          onClick={handleReviewShopping}
          disabled={meals.length === 0 || reviewing}
          className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50 min-h-11"
        >
          {reviewing ? "Building list…" : "Review shopping →"}
        </button>
      </div>

      {picker && (
        <RecipePickerModal
          recipes={recipes}
          onPick={(recipeId) => void handlePick(recipeId)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
