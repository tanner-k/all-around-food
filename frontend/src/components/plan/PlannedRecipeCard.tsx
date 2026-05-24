"use client";

interface PlannedRecipeCardProps {
  recipeTitle: string;
  onRemove: () => void;
}

export function PlannedRecipeCard({
  recipeTitle,
  onRemove,
}: PlannedRecipeCardProps) {
  return (
    <div className="rounded-lg bg-terra-soft px-2.5 py-2">
      <div className="flex items-start gap-1.5">
        <p className="flex-1 text-sm leading-snug text-ink">{recipeTitle}</p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${recipeTitle}`}
          className="text-sm leading-none text-terra transition-opacity hover:opacity-60"
        >
          ×
        </button>
      </div>
    </div>
  );
}
