"use client";

interface PlannedRecipeCardProps {
  recipeTitle: string;
  servings: number | null;
  baseServings: number | null;
  onServingsChange: (servings: number | null) => void;
  onRemove: () => void;
}

export function PlannedRecipeCard({ recipeTitle, servings, baseServings, onServingsChange, onRemove }: PlannedRecipeCardProps) {
  return (
    <div className="rounded-lg bg-terra-soft px-2.5 py-2">
      <div className="flex items-start gap-1.5">
        <p className="flex-1 text-sm leading-snug text-ink">{recipeTitle}</p>
        <button type="button" onClick={onRemove} aria-label={`Remove ${recipeTitle}`} className="min-h-7 min-w-7 text-sm leading-none text-terra transition-opacity hover:opacity-60">×</button>
      </div>
      <label className="mt-2 flex items-center gap-1 text-xs text-ink-soft">
        Servings
        <input type="number" min="0.5" step="0.5" aria-label={`${recipeTitle} servings`}
          value={servings ?? ""} placeholder={baseServings?.toString() ?? "recipe"}
          onChange={(event) => onServingsChange(event.target.value ? Number(event.target.value) : null)}
          className="min-h-8 w-16 rounded border border-line bg-paper px-1.5 text-ink" />
      </label>
    </div>
  );
}
