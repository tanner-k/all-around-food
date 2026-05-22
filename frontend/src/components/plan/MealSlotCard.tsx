"use client";

interface MealSlotCardProps {
  label: string;
  recipeTitle: string | null;
  onAdd: () => void;
  onRemove: () => void;
}

export function MealSlotCard({
  label,
  recipeTitle,
  onAdd,
  onRemove,
}: MealSlotCardProps) {
  if (recipeTitle) {
    return (
      <div className="rounded-lg bg-terra-soft px-2.5 py-2">
        <div className="flex items-start gap-1.5">
          <p className="flex-1 text-sm leading-snug text-ink">{recipeTitle}</p>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="text-sm leading-none text-terra transition-opacity hover:opacity-60"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-terra">
          {label}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-left text-xs font-medium text-ink-mute transition-colors hover:border-terra hover:text-terra"
    >
      + Add {label.toLowerCase()}
    </button>
  );
}
