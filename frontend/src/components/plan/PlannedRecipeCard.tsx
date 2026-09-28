"use client";

import { Minus, Plus, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

interface PlannedRecipeCardProps {
  recipeTitle: string;
  servings: number | null;
  baseServings: number | null;
  onServingsChange: (servings: number | null) => void;
  onRemove: () => void;
}

const MIN_SERVINGS = 0.5;

/** The −/+ buttons step whole servings; the input still accepts halves. */
export function stepServings(current: number | null, direction: 1 | -1): number {
  if (current === null) return direction === 1 ? 1 : MIN_SERVINGS;
  return Math.max(MIN_SERVINGS, current + direction);
}

export function PlannedRecipeCard({ recipeTitle, servings, baseServings, onServingsChange, onRemove }: PlannedRecipeCardProps) {
  const shown = servings ?? baseServings;
  return (
    <div className="rounded-control border border-line bg-paper p-3 shadow-card">
      <div className="flex items-start gap-2">
        <p className="flex-1 break-words pt-0.5 text-sm font-medium leading-snug text-ink hyphens-auto">{recipeTitle}</p>
        <IconButton aria-label={`Remove ${recipeTitle}`} onClick={onRemove} icon={<X className="size-4" />} className="-mr-2 -mt-2" />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-mute">Servings</span>
        <div className="-mr-2 flex items-center">
          <IconButton aria-label={`Decrease ${recipeTitle} servings`} disabled={shown !== null && shown <= MIN_SERVINGS}
            onClick={() => onServingsChange(stepServings(shown, -1))} icon={<Minus className="size-4" />} />
          <input type="number" min="0.5" step="0.5" aria-label={`${recipeTitle} servings`}
            value={servings ?? ""} placeholder={baseServings?.toString() ?? "recipe"}
            onChange={(event) => onServingsChange(event.target.value ? Number(event.target.value) : null)}
            className="h-9 w-14 rounded-control border border-line bg-paper px-1 text-center text-sm tabular-nums text-ink [appearance:textfield] placeholder:text-ink-mute focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <IconButton aria-label={`Increase ${recipeTitle} servings`}
            onClick={() => onServingsChange(stepServings(shown, 1))} icon={<Plus className="size-4" />} />
        </div>
      </div>
    </div>
  );
}
