import type { Recipe } from "@/lib/recipe-schema";
import { InlineAmountText } from "@/components/recipe/InlineAmountText";
import { CookIngredientPanel } from "./CookIngredientPanel";

interface CookScrollViewProps {
  recipe: Recipe;
}

export function CookScrollView({ recipe }: CookScrollViewProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 flex-1">
      {/* Mobile: ingredient accordion above the steps */}
      <CookIngredientPanel ingredients={recipe.ingredients} variant="mobile" />

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
                ingredients={recipe.ingredients}
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
      <CookIngredientPanel ingredients={recipe.ingredients} variant="desktop" />
    </div>
  );
}
