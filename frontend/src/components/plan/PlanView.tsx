"use client";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { plannedMealId, type MealPlan } from "@/lib/meal-plan-schema";
import { currentMonday, formatMonthDay, parseISODate, weekDays } from "@/lib/week";
import { assertCurrentLocalAccount, captureLocalAccount } from "@/lib/local/db";
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
  const [account] = useState(captureLocalAccount);
  const [picker, setPicker] = useState<{ dayIndex: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const failedWrite = useRef<unknown>(null);
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const meals = initialPlan.meals;
  const days = weekDays(weekOf);
  const hintId = useId();

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
      assertCurrentLocalAccount(account);
      await onGenerate(weekOf);
      assertCurrentLocalAccount(account);
      window.location.hash = localHref("shop").split("#")[1];
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not build shopping list."); }
    finally { setReviewing(false); }
  }

  function goToWeek(week: string) {
    window.location.hash = localHref("plan", week).split("#")[1];
  }

  const pickerDay = picker ? days[picker.dayIndex] : null;
  const plannedDays = new Set(meals.map((meal) => meal.day_index)).size;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl leading-tight text-ink md:text-3xl">Week of {formatMonthDay(weekOf)}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-ink-mute">{meals.length === 0 ? "Nothing planned yet" : `${meals.length} ${meals.length === 1 ? "recipe" : "recipes"} across ${plannedDays} ${plannedDays === 1 ? "day" : "days"}`}</p>
        </div>
        <div className="flex shrink-0 items-center">
          {weekOf !== currentMonday() && <Button variant="ghost" size="sm" href={localHref("plan", currentMonday())} className="mr-1">This week</Button>}
          <IconButton aria-label="Previous week" onClick={() => goToWeek(adjacentWeek(weekOf, -1))} icon={<ChevronLeft className="size-5" />} />
          <IconButton aria-label="Next week" onClick={() => goToWeek(adjacentWeek(weekOf, 1))} icon={<ChevronRight className="size-5" />} />
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p>}
      <ol aria-label={`Week of ${formatMonthDay(weekOf)}`} className="-mx-3 flex flex-col gap-1">
        {days.map((day) => <DayColumn key={day.index} day={day}
          meals={meals.flatMap((meal, index) => meal.day_index === day.index ? [{ id: plannedMealId(initialPlan, index), title: recipesById.get(meal.recipe_id)?.title ?? "Unknown recipe", servings: meal.servings, baseServings: recipesById.get(meal.recipe_id)?.servings ?? null }] : [])}
          onAdd={(dayIndex) => setPicker({ dayIndex })}
          onRemove={(id) => run(() => onRemove(weekOf, id))}
          onServingsChange={(id, servings) => run(() => onServingsChange(weekOf, id, servings))} />)}
      </ol>
      {meals.length === 0 ? (
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p id={hintId} className="text-sm text-ink-mute">Add a recipe to any day to build a shopping list.</p>
          <Button variant="secondary" disabled aria-describedby={hintId} className="self-start sm:self-auto">Review shopping →</Button>
        </div>
      ) : (
        // Sticks above the mobile tab bar (plan 07's --tabbar-height) while the week scrolls; static from md.
        <div className="sticky bottom-[calc(var(--tabbar-height,0px)+0.75rem)] z-10 flex justify-end border-line md:static md:border-t md:pt-5">
          <div className="w-full rounded-full shadow-raised md:w-auto md:shadow-none">
            <Button onClick={() => void handleReviewShopping()} loading={reviewing} fullWidth>{reviewing ? "Building list…" : "Review shopping →"}</Button>
          </div>
        </div>
      )}
      {picker && <RecipePickerModal recipes={recipes} dayLabel={pickerDay ? `${pickerDay.weekday} ${pickerDay.dayNum}` : undefined} onPick={handlePick} onClose={() => setPicker(null)} />}
    </div>
  );
}
