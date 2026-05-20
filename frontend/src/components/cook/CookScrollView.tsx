import type { Recipe } from "@/lib/recipe-schema";
import { InlineAmountText } from "@/components/recipe/InlineAmountText";

interface CookScrollViewProps {
  recipe: Recipe;
}

export function CookScrollView({ recipe }: CookScrollViewProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 flex-1">
      {/* Ingredient reference panel */}
      {/* Mobile: collapsible details accordion at top */}
      {/* Desktop: sticky sidebar */}
      <aside className="lg:hidden">
        <details className="rounded-xl border border-line bg-paper-2">
          <summary className="px-4 py-3 text-sm font-semibold text-ink cursor-pointer select-none list-none flex items-center justify-between">
            <span>Ingredients ({recipe.ingredients.length})</span>
            <span className="text-ink-mute text-xs">tap to expand</span>
          </summary>
          <ul className="px-4 pb-4 flex flex-col gap-1.5 border-t border-line mt-0 pt-3">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="text-ink-mute">·</span>
                <span className="text-ink">{ing.name}</span>
                <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap">
                  {ing.quantity.as_written}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </aside>

      {/* Steps */}
      <div className="flex-1 flex flex-col gap-4">
        {recipe.steps.map((step) => (
          <div
            key={step.order}
            className="rounded-xl bg-paper-2 border border-line p-4"
          >
            <div className="font-serif italic text-terra text-xl mb-2">
              {step.order}.
            </div>
            <p className="text-sm text-ink leading-relaxed">
              <InlineAmountText
                instruction={step.instruction}
                inlineAmounts={step.inline_amounts}
              />
            </p>
            {step.duration_min && (
              <div className="mt-2 text-xs text-ink-mute">
                ⏱ {step.duration_min} min
              </div>
            )}
            {step.temperature_f && (
              <div className="mt-1 text-xs text-ink-mute">
                🌡 {step.temperature_f}°F
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: sticky ingredient sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-6 rounded-xl border border-line bg-paper-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
            Ingredients
          </p>
          <ul className="flex flex-col gap-1.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="text-ink-mute">·</span>
                <span className="text-ink">{ing.name}</span>
                <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap">
                  {ing.quantity.as_written}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
