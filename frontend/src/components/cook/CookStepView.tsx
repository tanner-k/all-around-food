import type { Ingredient, Step } from '@/lib/recipe-schema';
import { InlineAmountText } from '@/components/recipe/InlineAmountText';
import { CookIngredientPanel } from './CookIngredientPanel';
import { IngredientsSheetTrigger } from './IngredientsSheet';

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
    <div className="flex flex-col lg:flex-row gap-6 flex-1">
      {/* Mobile: ingredient accordion above the steps — hidden when mobileLayout (use sheet instead) */}
      {!mobileLayout && (
        <CookIngredientPanel ingredients={ingredients} variant="mobile" />
      )}

      {/* Main column: steps + navigation */}
      <div className="flex flex-col gap-4 flex-1 px-4 pt-4 md:px-0 md:pt-0">
        {/* Sheet trigger pill — mobile only */}
        {mobileLayout && onShowIngredients && (
          <div className="flex justify-end">
            <IngredientsSheetTrigger onClick={onShowIngredients} />
          </div>
        )}

        {/* Steps */}
        <div className="flex flex-col gap-3 flex-1">
          {visibleIndexes.map((idx) => {
            const step = steps[idx];
            const isActive = idx === currentStep;
            const isPast = idx < currentStep;
            const isFuture = idx > currentStep;

            return (
              <div
                key={step.order}
                className={[
                  'rounded-xl p-4 transition-all',
                  isActive
                    ? 'bg-paper border-2 border-terra shadow-sm'
                    : 'bg-paper-2 border border-line',
                  isFuture ? 'opacity-45' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'font-serif italic text-terra mb-2',
                    isActive ? 'text-2xl' : 'text-xl',
                  ].join(' ')}
                >
                  {step.order}.
                </div>
                <p
                  className={[
                    'leading-relaxed',
                    isActive ? 'text-base text-ink' : 'text-sm text-ink-soft',
                  ].join(' ')}
                >
                  <InlineAmountText instruction={step.instruction} ingredients={ingredients} />
                </p>
                {/* Timer trigger for active step */}
                {isActive && step.duration_min && (
                  <button
                    type="button"
                    onClick={() => onStartTimer(step.duration_min!)}
                    className="mt-3 text-xs text-terra border border-terra-soft bg-terra-soft rounded-full px-3 py-1 hover:bg-terra hover:text-white active:bg-terra active:text-white transition-colors"
                  >
                    ⏲ Start {step.duration_min} min timer
                  </button>
                )}
                {isActive && step.temperature_f && (
                  <div className="mt-2 text-xs text-ink-mute">🌡 {step.temperature_f}°F</div>
                )}
                {isPast && <div className="mt-2 text-xs text-forest font-medium">✓ done</div>}
              </div>
            );
          })}
        </div>

        {/* Navigation buttons — hidden on mobile (bottom bar handles nav) */}
        {!mobileLayout && (
          <div className="flex gap-3 mt-auto pt-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentStep === 0}
              className="flex-1 min-h-14 rounded-xl border border-line bg-paper text-ink font-semibold text-sm transition-colors hover:bg-paper-2 active:bg-paper-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex-1 min-h-14 rounded-xl bg-terra text-white font-semibold text-sm transition-colors hover:bg-[#A55230] active:bg-[#A55230]"
            >
              {currentStep >= total - 1 ? 'Finish →' : 'Next →'}
            </button>
          </div>
        )}
      </div>

      {/* Desktop: sticky ingredient sidebar */}
      <CookIngredientPanel ingredients={ingredients} variant="desktop" />
    </div>
  );
}
