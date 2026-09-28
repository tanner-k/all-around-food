import { Check, Thermometer, Timer } from "lucide-react";
import type { Ingredient, Step } from "@/lib/recipe-schema";
import { InlineAmountText } from "@/components/recipe/InlineAmountText";
import { Button } from "@/components/ui/Button";
import { CookIngredientPanel } from "./CookIngredientPanel";
import { IngredientsSheetTrigger } from "./IngredientsSheet";

interface CookStepViewProps {
  steps: Step[];
  ingredients: Ingredient[];
  currentStep: number;
  onPrev: () => void;
  onNext: () => void;
  onStartTimer: (minutes: number) => void;
  /** When true, hides inline nav buttons and shows the sheet trigger pill */
  mobileLayout?: boolean;
  onShowIngredients?: () => void;
}

export function CookStepView({
  steps,
  ingredients,
  currentStep,
  onPrev,
  onNext,
  onStartTimer,
  mobileLayout = false,
  onShowIngredients,
}: CookStepViewProps) {
  const total = steps.length;

  // Show prev, current, and next step
  const visibleIndexes = [-1, 0, 1]
    .map((offset) => currentStep + offset)
    .filter((i) => i >= 0 && i < total);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 flex-1">
      {/* Mobile: ingredient accordion above the steps — hidden when mobileLayout (use sheet instead) */}
      {!mobileLayout && (
        <CookIngredientPanel ingredients={ingredients} variant="mobile" />
      )}

      {/* Main column: steps + navigation */}
      <div className="flex flex-col gap-5 flex-1 px-4 pt-5 md:px-0 md:pt-0">
        {/* Sheet trigger pill — mobile only */}
        {mobileLayout && onShowIngredients && (
          <div className="flex justify-end">
            <IngredientsSheetTrigger onClick={onShowIngredients} />
          </div>
        )}

        {/* Steps */}
        <div className="flex flex-col gap-4 flex-1">
          {visibleIndexes.map((idx) => {
            const step = steps[idx];
            const isActive = idx === currentStep;
            const isPast = idx < currentStep;
            const isFuture = idx > currentStep;

            return (
              <div
                key={step.order}
                aria-current={isActive ? "step" : undefined}
                className={[
                  "rounded-card transition-all",
                  isActive
                    ? "bg-paper border-2 border-terra shadow-raised p-5 md:p-7"
                    : "bg-paper-2 border border-line p-4",
                  isFuture ? "opacity-45" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "font-serif italic text-terra tabular-nums leading-none",
                    isActive ? "text-3xl md:text-4xl mb-3" : "text-xl mb-2",
                  ].join(" ")}
                >
                  {step.order}.
                </div>
                <p
                  className={[
                    "tabular-nums text-pretty",
                    isActive
                      ? "text-lg md:text-xl leading-relaxed text-ink"
                      : "text-sm leading-relaxed text-ink-soft",
                  ].join(" ")}
                >
                  <InlineAmountText instruction={step.instruction} ingredients={ingredients} />
                </p>
                {/* Timer trigger for active step */}
                {isActive && step.duration_min && (
                  <button
                    type="button"
                    onClick={() => onStartTimer(step.duration_min!)}
                    className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-terra-soft bg-terra-soft px-4 text-sm font-semibold text-terra tabular-nums transition-colors hover:bg-terra hover:text-white active:bg-terra active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <Timer className="size-4" aria-hidden="true" />
                    Start {step.duration_min} min timer
                  </button>
                )}
                {isActive && step.temperature_f && (
                  <div className="mt-3 inline-flex items-center gap-1 text-sm text-ink-mute tabular-nums">
                    <Thermometer className="size-4" aria-hidden="true" />
                    {step.temperature_f}°F
                  </div>
                )}
                {isPast && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs text-forest font-medium">
                    <Check className="size-3.5" aria-hidden="true" />
                    done
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Navigation buttons — hidden on mobile (bottom bar handles nav) */}
        {!mobileLayout && (
          <div className="flex gap-3 mt-auto pt-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={onPrev}
              disabled={currentStep === 0}
            >
              <span aria-hidden="true">‹</span> Back
            </Button>
            <Button size="lg" className="flex-1" onClick={onNext}>
              {currentStep >= total - 1 ? "Finish" : "Next"} <span aria-hidden="true">→</span>
            </Button>
          </div>
        )}
      </div>

      {/* Desktop: sticky ingredient sidebar */}
      <CookIngredientPanel ingredients={ingredients} variant="desktop" />
    </div>
  );
}
