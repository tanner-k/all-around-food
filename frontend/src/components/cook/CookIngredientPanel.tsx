import type { Ingredient } from "@/lib/recipe-schema";

function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {ingredients.map((ing, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm">
          <span className="text-ink-mute">·</span>
          <span className="text-ink">{ing.name}</span>
          {ing.quantity.as_written && (
            <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap">
              {ing.quantity.as_written}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface CookIngredientPanelProps {
  ingredients: Ingredient[];
  /** "mobile" → collapsible accordion; "desktop" → sticky sidebar. */
  variant: "mobile" | "desktop";
}

/**
 * Ingredient reference shown alongside the steps in cook mode.
 * Rendered as siblings of the step content so flex layout can place the
 * accordion above (mobile) and the sidebar beside (desktop) the steps.
 */
export function CookIngredientPanel({
  ingredients,
  variant,
}: CookIngredientPanelProps) {
  if (variant === "mobile") {
    return (
      <aside className="lg:hidden">
        <details className="rounded-xl border border-line bg-paper-2">
          <summary className="px-4 py-3 text-sm font-semibold text-ink cursor-pointer select-none list-none flex items-center justify-between">
            <span>Ingredients ({ingredients.length})</span>
            <span className="text-ink-mute text-xs">tap to expand</span>
          </summary>
          <div className="px-4 pb-4 border-t border-line pt-3">
            <IngredientList ingredients={ingredients} />
          </div>
        </details>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-6 rounded-xl border border-line bg-paper-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
          Ingredients
        </p>
        <IngredientList ingredients={ingredients} />
      </div>
    </aside>
  );
}
