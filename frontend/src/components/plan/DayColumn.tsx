"use client";

import type { MealSlot } from "@/lib/meal-plan-schema";
import type { DayInfo } from "@/lib/week";
import { MealSlotCard } from "./MealSlotCard";

interface DayColumnProps {
  day: DayInfo;
  dinnerTitle: string | null;
  lunchTitle: string | null;
  onAdd: (dayIndex: number, slot: MealSlot) => void;
  onRemove: (dayIndex: number, slot: MealSlot) => void;
}

export function DayColumn({
  day,
  dinnerTitle,
  lunchTitle,
  onAdd,
  onRemove,
}: DayColumnProps) {
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

      {/* Dinner — always present */}
      <MealSlotCard
        label="Dinner"
        recipeTitle={dinnerTitle}
        onAdd={() => onAdd(day.index, "dinner")}
        onRemove={() => onRemove(day.index, "dinner")}
      />

      {/* Lunch — optional */}
      {lunchTitle !== null ? (
        <MealSlotCard
          label="Lunch"
          recipeTitle={lunchTitle}
          onAdd={() => onAdd(day.index, "lunch")}
          onRemove={() => onRemove(day.index, "lunch")}
        />
      ) : (
        <button
          type="button"
          onClick={() => onAdd(day.index, "lunch")}
          className="text-left text-[11px] font-medium text-ink-mute transition-colors hover:text-terra"
        >
          + add lunch
        </button>
      )}
    </div>
  );
}
