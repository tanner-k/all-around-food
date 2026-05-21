"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/recipe-schema";
import { CookStepView } from "./CookStepView";
import { CookScrollView } from "./CookScrollView";
import { CookTimer } from "./CookTimer";
import { CookDoneView } from "./CookDoneView";

type Layout = "step" | "scroll";

interface CookModeProps {
  recipe: Recipe;
}

const LAYOUT_KEY = "aaf:cookLayout";

export function CookMode({ recipe }: CookModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved === "step" || saved === "scroll") return saved;
    }
    return "step";
  });

  // Timer state: -1 = not started
  const [timerSeconds, setTimerSeconds] = useState(-1);
  const [timerRunning, setTimerRunning] = useState(false);

  const total = recipe.steps.length;
  const ingredientNames = useMemo(
    () => recipe.ingredients.map((i) => i.name),
    [recipe.ingredients]
  );

  function handleLayoutChange(next: Layout) {
    setLayout(next);
    localStorage.setItem(LAYOUT_KEY, next);
  }

  function handlePrev() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function handleNext() {
    if (currentStep >= total - 1) {
      setDone(true);
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleStartTimer(minutes: number) {
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  }

  const handleTick = useCallback((secondsLeft: number) => {
    setTimerSeconds(secondsLeft);
    if (secondsLeft === 0) setTimerRunning(false);
  }, []);

  function handleTimerPause() {
    setTimerRunning((r) => !r);
  }

  function handleTimerReset() {
    setTimerSeconds(-1);
    setTimerRunning(false);
  }

  // Progress percentage
  const progressPct =
    layout === "step" ? ((currentStep + 1) / total) * 100 : 100;

  if (done) {
    return (
      <CookDoneView
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        stepCount={total}
        ingredientNames={ingredientNames}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100dvh-80px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Exit */}
        <Link
          href={`/cookbook/${recipe.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-paper-2 border border-line text-sm text-ink-soft hover:text-ink transition-colors"
        >
          ← Exit
        </Link>

        {/* Step counter + layout toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-mute">
            Step {currentStep + 1} of {total}
          </span>

          {/* Layout toggle */}
          <div className="flex rounded-full border border-line overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => handleLayoutChange("step")}
              className={[
                "px-3 py-1 transition-colors",
                layout === "step"
                  ? "bg-terra text-white"
                  : "bg-paper text-ink-soft hover:bg-paper-2",
              ].join(" ")}
            >
              Step
            </button>
            <button
              type="button"
              onClick={() => handleLayoutChange("scroll")}
              className={[
                "px-3 py-1 transition-colors",
                layout === "scroll"
                  ? "bg-terra text-white"
                  : "bg-paper text-ink-soft hover:bg-paper-2",
              ].join(" ")}
            >
              Scroll
            </button>
          </div>
        </div>

        {/* Timer */}
        {timerSeconds >= 0 ? (
          <CookTimer
            secondsLeft={timerSeconds}
            running={timerRunning}
            onTick={handleTick}
            onPause={handleTimerPause}
            onReset={handleTimerReset}
          />
        ) : (
          <div className="w-20" />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-[3px] rounded-full bg-paper-2 overflow-hidden">
        <div
          className="h-full bg-terra rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col">
        {layout === "step" ? (
          <CookStepView
            steps={recipe.steps}
            ingredients={recipe.ingredients}
            currentStep={currentStep}
            onPrev={handlePrev}
            onNext={handleNext}
            onStartTimer={handleStartTimer}
          />
        ) : (
          <CookScrollView recipe={recipe} />
        )}
      </div>
    </div>
  );
}
