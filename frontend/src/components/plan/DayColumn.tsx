"use client";

import type { DayInfo } from "@/lib/week";
import { PlannedRecipeCard } from "./PlannedRecipeCard";

interface DayMeal {
  id: string;
  title: string;
  servings: number | null;
  baseServings: number | null;
}

interface DayColumnProps {
  day: DayInfo;
  meals: DayMeal[];
  onAdd: (dayIndex: number) => void;
  onRemove: (id: string) => void;
  onServingsChange: (id: string, servings: number | null) => void;
}

const addButton = "-ml-3 min-h-11 rounded-control px-3 text-ink-mute text-sm font-medium transition-colors hover:bg-paper-2 hover:text-terra-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** One day of the week as an agenda row: quiet when empty, cards when filled. */
export function DayColumn({ day, meals, onAdd, onRemove, onServingsChange }: DayColumnProps) {
  const filled = meals.length > 0;
  return (
    <li aria-current={day.isToday ? "date" : undefined}
      className={["grid grid-cols-[2.75rem_1fr] items-start gap-x-3 rounded-card border px-3 md:grid-cols-[4rem_1fr] md:gap-x-6",
        filled ? "py-3" : "py-1.5",
        day.isToday ? "border-terra bg-terra-soft/40" : "border-transparent"].join(" ")}>
      <div className="flex min-h-11 flex-col justify-center">
        <span className={["text-xs font-semibold uppercase tracking-wide", day.isToday ? "text-terra-strong" : "text-ink-mute"].join(" ")}>{day.weekday}</span>
        <span className="font-serif text-2xl leading-none tabular-nums text-ink">{day.dayNum}</span>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2">
        {filled && <ul className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {meals.map((meal) => <li key={meal.id}><PlannedRecipeCard recipeTitle={meal.title} servings={meal.servings}
            baseServings={meal.baseServings} onServingsChange={(servings) => onServingsChange(meal.id, servings)}
            onRemove={() => onRemove(meal.id)} /></li>)}
        </ul>}
        <button type="button" onClick={() => onAdd(day.index)} className={addButton}>+ Add recipe</button>
      </div>
    </li>
  );
}
