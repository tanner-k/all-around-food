"use client";

import { useRef } from "react";
import { X, List } from "lucide-react";
import type { Ingredient } from "@/lib/recipe-schema";
import { formatIngredientAmount } from "@/lib/format-quantity";
import { Sheet } from "@/components/ui/Sheet";
import { IconButton } from "@/components/ui/IconButton";

interface IngredientsSheetProps {
  open: boolean;
  ingredients: Ingredient[];
  onClose: () => void;
}

function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {ingredients.map((ing, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm">
          <span aria-hidden="true" className="text-ink-mute">
            ·
          </span>
          <span className="text-pretty text-ink">{ing.name}</span>
          {formatIngredientAmount(ing.quantity) && (
            <span className="whitespace-nowrap rounded-control bg-terra-soft px-1.5 py-0.5 text-xs font-medium tabular-nums text-terra-strong">
              {formatIngredientAmount(ing.quantity)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IngredientsSheet({
  open,
  ingredients,
  onClose,
}: IngredientsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      aria-label="Ingredients"
      initialFocusRef={closeButtonRef}
    >
      <div className="flex items-center justify-between border-b border-line pl-4 pr-2 py-1">
        <div className="flex items-center gap-2">
          <List className="size-4 text-ink-soft" aria-hidden="true" />
          <span className="text-sm font-semibold text-ink">
            Ingredients ({ingredients.length})
          </span>
        </div>
        <IconButton
          ref={closeButtonRef}
          aria-label="Close ingredients"
          icon={<X className="size-5" />}
          onClick={onClose}
        />
      </div>

      <div className="px-4 py-4">
        <IngredientList ingredients={ingredients} />
      </div>
    </Sheet>
  );
}

/** Floating trigger button — shown only on mobile (md:hidden) */
export function IngredientsSheetTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper border border-line text-xs font-medium text-ink-soft shadow-card hover:text-ink hover:bg-paper-2 active:bg-paper-2 active:text-ink transition-colors"
      aria-label="Show ingredients"
    >
      <List className="w-3.5 h-3.5" aria-hidden="true" />
      Ingredients
    </button>
  );
}
