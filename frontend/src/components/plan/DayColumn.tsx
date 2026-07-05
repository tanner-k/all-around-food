"use client";

import type { DayInfo } from "@/lib/week";
import { PlannedRecipeCard } from "./PlannedRecipeCard";

interface DayMeal {
  title: string;
  recipeId: string;
}

interface DayColumnProps {
  day: DayInfo;
  meals: DayMeal[];
  onAdd: (dayIndex: number) => void;
  onRemove: (dayIndex: number, recipeId: string) => void;
}

export function DayColumn({ day, meals, onAdd, onRemove }: DayColumnProps) {
  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-xl border p-2.5",
        day.isToday
          ? "border-terra bg-terra-soft/40"
          : "border-line bg-paper",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <span
          className={[
            "text-xs font-semibold uppercase tracking-wide",
            day.isToday ? "text-terra" : "text-ink-mute",
          ].join(" ")}
        >
          {day.weekday}
        </span>
        <span className="font-serif text-lg leading-none text-ink">
          {day.dayNum}
        </span>
      </div>

      {/* Planned recipes — however many */}
      {meals.map((meal) => (
        <PlannedRecipeCard
          key={meal.recipeId}
          recipeTitle={meal.title}
          onRemove={() => onRemove(day.index, meal.recipeId)}
        />
      ))}

      {/* Add — always available */}
      <button
        type="button"
        onClick={() => onAdd(day.index)}
        className="w-full rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-left text-xs font-medium text-ink-mute transition-colors hover:border-terra hover:text-terra"
      >
        + Add recipe
      </button>
    </div>
  );
}
