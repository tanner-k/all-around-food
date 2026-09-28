import { Thermometer, Timer } from "lucide-react";
import type { Recipe } from "@/lib/recipe-schema";
import { InlineAmountText } from "@/components/recipe/InlineAmountText";
import { CookIngredientPanel } from "./CookIngredientPanel";

interface CookScrollViewProps {
  recipe: Recipe;
}

export function CookScrollView({ recipe }: CookScrollViewProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 flex-1">
      {/* Mobile: ingredient accordion above the steps */}
      <CookIngredientPanel ingredients={recipe.ingredients} variant="mobile" />

      {/* Steps */}
      <div className="flex-1 flex flex-col gap-4">
        {recipe.steps.map((step) => (
          <div
            key={step.order}
            className="rounded-card bg-paper-2 border border-line p-5"
          >
            <div className="font-serif italic text-terra text-2xl leading-none tabular-nums mb-3">
              {step.order}.
            </div>
            <p className="text-base md:text-lg text-ink leading-relaxed tabular-nums text-pretty">
              <InlineAmountText
                instruction={step.instruction}
                ingredients={recipe.ingredients}
              />
            </p>
            {Boolean(step.duration_min || step.temperature_f) && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-mute tabular-nums">
                {Boolean(step.duration_min) && (
                  <span className="inline-flex items-center gap-1">
                    <Timer className="size-4" aria-hidden="true" />
                    {step.duration_min} min
                  </span>
                )}
                {Boolean(step.temperature_f) && (
                  <span className="inline-flex items-center gap-1">
                    <Thermometer className="size-4" aria-hidden="true" />
                    {step.temperature_f}°F
                  </span>
                )}
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
