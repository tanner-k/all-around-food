"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateShoppingList, saveMealPlan } from "@/lib/api";
import type { MealPlan, MealSlot, PlannedMeal } from "@/lib/meal-plan-schema";
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
  const [picker, setPicker] = useState<{
    dayIndex: number;
    slot: MealSlot;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const titleById = new Map(recipes.map((r) => [r.id, r.title]));
  const days = weekDays(weekOf);

  function titleAt(dayIndex: number, slot: MealSlot): string | null {
    const meal = meals.find(
      (m) => m.day_index === dayIndex && m.slot === slot
    );
    if (!meal) return null;
    return titleById.get(meal.recipe_id) ?? "Unknown recipe";
  }

  async function persist(next: PlannedMeal[]) {
    const previous = meals;
    setMeals(next);
    setError(null);
    try {
      await saveMealPlan(weekOf, next);
    } catch (err) {
      setMeals(previous);
      setError(err instanceof Error ? err.message : "Failed to save plan");
    }
  }

  function handlePick(recipeId: string) {
    if (!picker) return;
    const { dayIndex, slot } = picker;
    const next: PlannedMeal[] = [
      ...meals.filter(
        (m) => !(m.day_index === dayIndex && m.slot === slot)
      ),
      { day_index: dayIndex, slot, recipe_id: recipeId },
    ];
    setPicker(null);
    void persist(next);
  }

  function handleRemove(dayIndex: number, slot: MealSlot) {
    void persist(
      meals.filter((m) => !(m.day_index === dayIndex && m.slot === slot))
    );
  }

  async function handleReviewShopping() {
    if (meals.length === 0 || reviewing) return;
    setReviewing(true);
    setError(null);
    try {
      const recipeIds = [...new Set(meals.map((m) => m.recipe_id))];
      await generateShoppingList(recipeIds);
      router.push("/shop");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to build shopping list"
      );
      setReviewing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-mute">
        Week of {formatMonthDay(weekOf)} · {meals.length}{" "}
        {meals.length === 1 ? "meal" : "meals"} planned
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
            dinnerTitle={titleAt(day.index, "dinner")}
            lunchTitle={titleAt(day.index, "lunch")}
            onAdd={(dayIndex, slot) => setPicker({ dayIndex, slot })}
            onRemove={handleRemove}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-ink-mute">
          Plan your week, then turn it into a shopping list.
        </p>
        <button
          type="button"
          onClick={handleReviewShopping}
          disabled={meals.length === 0 || reviewing}
          className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
        >
          {reviewing ? "Building list…" : "Review shopping →"}
        </button>
      </div>

      {picker && (
        <RecipePickerModal
          slotLabel={picker.slot}
          recipes={recipes}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
