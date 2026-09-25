"use client";

import { useRef, useState } from "react";
import { plannedMealId, type MealPlan } from "@/lib/meal-plan-schema";
import { formatMonthDay, parseISODate, weekDays } from "@/lib/week";
import { localHref } from "@/lib/local/navigation";
import { DayColumn } from "./DayColumn";
import { RecipePickerModal } from "./RecipePickerModal";

interface RecipeOption { id: string; title: string; servings: number | null }
interface PlanViewProps {
  weekOf: string;
  initialPlan: MealPlan;
  recipes: RecipeOption[];
  onAdd: (weekOf: string, dayIndex: number, recipeId: string) => Promise<void>;
  onRemove: (weekOf: string, occurrenceId: string) => Promise<void>;
  onServingsChange: (weekOf: string, occurrenceId: string, servings: number | null) => Promise<void>;
  onGenerate: (weekOf: string) => Promise<void>;
}

function adjacentWeek(weekOf: string, offset: number): string {
  const date = parseISODate(weekOf);
  date.setDate(date.getDate() + offset * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PlanView({ weekOf, initialPlan, recipes, onAdd, onRemove, onServingsChange, onGenerate }: PlanViewProps) {
  const [picker, setPicker] = useState<{ dayIndex: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const failedWrite = useRef<unknown>(null);
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const meals = initialPlan.meals;

  function run(action: () => Promise<void>): void {
    const failureAtSchedule = failedWrite.current;
    setError(null);
    const next = pendingWrite.current.catch(() => undefined).then(action);
    pendingWrite.current = next;
    void next.then(() => {
      if (failureAtSchedule !== null && failedWrite.current === failureAtSchedule) failedWrite.current = null;
      if (failedWrite.current === null) setError(null);
    }, (cause) => {
      failedWrite.current = cause ?? new Error("Could not update this week.");
      setError(cause instanceof Error ? cause.message : "Could not update this week.");
    });
  }

  function handlePick(recipeId: string) {
    if (!picker) return;
    const dayIndex = picker.dayIndex;
    setPicker(null);
    run(() => onAdd(weekOf, dayIndex, recipeId));
  }

  async function handleReviewShopping() {
    if (meals.length === 0 || reviewing) return;
    setReviewing(true);
    setError(null);
    try {
      await pendingWrite.current;
      if (failedWrite.current) throw failedWrite.current;
      await onGenerate(weekOf);
      window.location.hash = localHref("shop").split("#")[1];
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not build shopping list."); }
    finally { setReviewing(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-mute">
        <p>Week of {formatMonthDay(weekOf)} · {meals.length} {meals.length === 1 ? "recipe" : "recipes"} planned</p>
        <div className="flex gap-2"><a href={localHref("plan", adjacentWeek(weekOf, -1))} className="rounded-lg border border-line px-3 py-2 text-ink">Previous week</a><a href={localHref("plan", adjacentWeek(weekOf, 1))} className="rounded-lg border border-line px-3 py-2 text-ink">Next week</a></div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {weekDays(weekOf).map((day) => <DayColumn key={day.index} day={day}
          meals={meals.flatMap((meal, index) => meal.day_index === day.index ? [{ id: plannedMealId(initialPlan, index), title: recipesById.get(meal.recipe_id)?.title ?? "Unknown recipe", servings: meal.servings, baseServings: recipesById.get(meal.recipe_id)?.servings ?? null }] : [])}
          onAdd={(dayIndex) => setPicker({ dayIndex })}
          onRemove={(id) => run(() => onRemove(weekOf, id))}
          onServingsChange={(id, servings) => run(() => onServingsChange(weekOf, id, servings))} />)}
      </div>
      <div className="flex flex-col justify-between gap-3 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="text-sm text-ink-mute">Plan your week, then turn it into a shopping list.</p>
        <button type="button" onClick={() => void handleReviewShopping()} disabled={meals.length === 0 || reviewing}
          className="min-h-11 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50">{reviewing ? "Building list…" : "Review shopping →"}</button>
      </div>
      {picker && <RecipePickerModal recipes={recipes} onPick={handlePick} onClose={() => setPicker(null)} />}
    </div>
  );
}
