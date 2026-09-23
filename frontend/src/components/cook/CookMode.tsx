"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import type { Recipe } from "@/lib/recipe-schema";
import { CookStepView } from "./CookStepView";
import { CookScrollView } from "./CookScrollView";
import { CookTimer } from "./CookTimer";
import { CookDoneView } from "./CookDoneView";
import { IngredientsSheet } from "./IngredientsSheet";
import { TimerSheet } from "./TimerSheet";
import { formatTime } from "@/lib/format-time";
import type { CookProgress, CookProgressPatch } from "@/lib/local/schema";
import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";
import { localHref } from "@/lib/local/navigation";

type Layout = "step" | "scroll";

interface CookModeProps {
  recipe: Recipe;
  progress: CookProgress;
  pantry: PantryItem[];
  onSaveProgress: (progress: CookProgressPatch) => Promise<void>;
  onComplete: (sessionId: string) => Promise<boolean>;
  onSetPantryStatus: (id: string, status: PantryStatus) => Promise<void>;
}

type CookView = Pick<CookProgress, "step" | "layout" | "timer_end_at" | "paused_seconds">;

function viewOf(progress: CookProgress): CookView {
  const { step, layout, timer_end_at, paused_seconds } = progress;
  return { step, layout, timer_end_at, paused_seconds };
}

export function CookMode({ recipe, progress, pantry, onSaveProgress, onComplete, onSetPantryStatus }: CookModeProps) {
  const [view, setView] = useState<CookView>(() => viewOf(progress));
  const [done, setDone] = useState(Boolean(progress.completed_at));
  const [now, setNow] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingWrites = useRef(0);
  const currentStep = view.step;
  const layout = view.layout;
  const timerEndAt = view.timer_end_at;
  const pausedSeconds = view.paused_seconds;
  const timerRunning = timerEndAt !== null && now > 0 && timerEndAt > now;
  const timerSeconds = timerEndAt !== null ? now > 0 ? Math.max(0, Math.ceil((timerEndAt - now) / 1000)) : -1 : pausedSeconds ?? -1;

  useEffect(() => {
    if (timerEndAt === null) return;
    const tick = () => setNow(Date.now());
    const firstTick = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => { clearTimeout(firstTick); clearInterval(interval); window.removeEventListener("focus", tick); };
  }, [timerEndAt]);

  // Adopt progress another view committed. Incoming snapshots are never written
  // back, so two views of one session converge instead of echoing stale state.
  useEffect(() => {
    if (pendingWrites.current > 0) return;
    setView(viewOf(progress));
    setDone((current) => current || Boolean(progress.completed_at));
  }, [progress]);

  // Persist only this action's fields; the repository merges them atomically.
  function apply(patch: Partial<CookView>) {
    setView((current) => ({ ...current, ...patch }));
    pendingWrites.current += 1;
    void onSaveProgress({ recipe_id: progress.recipe_id, session_id: progress.session_id, ...patch })
      .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : "Unable to save progress."))
      .finally(() => { pendingWrites.current -= 1; });
  }

  // Mobile sheet state
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);

  const total = recipe.steps.length;
  const ingredientNames = useMemo(
    () => recipe.ingredients.map((i) => i.name),
    [recipe.ingredients]
  );

  function handleLayoutChange(next: Layout) {
    apply({ layout: next });
  }

  function handlePrev() {
    apply({ step: Math.max(0, currentStep - 1) });
  }

  function handleNext() {
    if (currentStep >= total - 1) {
      setDone(true);
    } else {
      apply({ step: currentStep + 1 });
    }
  }

  function handleStartTimer(minutes: number) {
    apply({ timer_end_at: Date.now() + minutes * 60_000, paused_seconds: null });
    setNow(Date.now());
  }

  function handleTimerPause() {
    if (timerEndAt !== null) {
      apply({ paused_seconds: Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000)), timer_end_at: null });
    } else if (pausedSeconds !== null) {
      apply({ timer_end_at: Date.now() + pausedSeconds * 1000, paused_seconds: null });
    }
  }

  function handleTimerReset() {
    apply({ timer_end_at: null, paused_seconds: null });
    setTimerSheetOpen(false);
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
        pantry={pantry}
        onSetPantryStatus={onSetPantryStatus}
        onComplete={() => onComplete(progress.session_id!)}
      />
    );
  }

  return (
    <>
      {/* ── MOBILE LAYOUT (below md) ─────────────────────────────────── */}
      <div className="md:hidden flex flex-col min-h-[100dvh]">
        {/* Sticky top strip */}
        <div className="sticky top-0 z-20 flex items-center h-12 px-3 bg-paper/80 backdrop-blur border-b border-line">
          <a
            href={localHref("recipe", recipe.id)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-ink-soft hover:text-ink active:text-ink hover:bg-paper-2 active:bg-paper-2 transition-colors"
            aria-label="Exit cook mode"
          >
            <X className="w-4 h-4" />
          </a>
          <span className="flex-1 text-center text-sm font-medium text-ink">
            {currentStep + 1} / {total}
          </span>
          {/* Spacer to balance the X button */}
          <div className="w-8" />
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-paper-2 overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-terra transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Step content — fills space between top strip and bottom bar */}
        <div className="flex-1 overflow-y-auto pb-2">
          <CookStepView
            steps={recipe.steps}
            ingredients={recipe.ingredients}
            currentStep={currentStep}
            onPrev={handlePrev}
            onNext={handleNext}
            onStartTimer={handleStartTimer}
            mobileLayout
            onShowIngredients={() => setIngredientsOpen(true)}
          />
        </div>

        {/* Sticky bottom action bar */}
        <div className="sticky bottom-0 z-20 bg-paper/90 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-3 gap-2 px-3 py-2">
            {/* Prev */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="min-h-14 rounded-xl border border-line bg-paper text-ink font-semibold text-sm flex items-center justify-center transition-transform active:scale-[0.98] hover:bg-paper-2 active:bg-paper-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>

            {/* Timer */}
            <button
              type="button"
              onClick={() => timerSeconds >= 0 && setTimerSheetOpen(true)}
              disabled={timerSeconds < 0}
              className={[
                "min-h-14 rounded-xl font-semibold text-sm flex items-center justify-center transition-transform active:scale-[0.98]",
                timerSeconds >= 0 && timerRunning
                  ? "bg-terra text-white hover:bg-[#A55230] active:bg-[#A55230]"
                  : timerSeconds >= 0
                  ? "bg-terra-soft text-terra border border-terra-soft hover:bg-terra/20 active:bg-terra/20"
                  : "border border-line bg-paper text-ink-soft opacity-40 cursor-not-allowed",
              ].join(" ")}
              aria-label={timerSeconds >= 0 ? "Open timer" : "Timer (not set)"}
            >
              {timerSeconds >= 0 ? formatTime(timerSeconds) : "Timer"}
            </button>

            {/* Next / Finish */}
            <button
              type="button"
              onClick={handleNext}
              className="min-h-14 rounded-xl bg-terra text-white font-semibold text-sm flex items-center justify-center transition-transform active:scale-[0.98] hover:bg-[#A55230] active:bg-[#A55230]"
            >
              {currentStep >= total - 1 ? "Finish →" : "Next →"}
            </button>
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT (md+) ─────────────────────────────────────── */}
      <div className="hidden md:flex flex-col gap-4 min-h-[calc(100dvh-80px)]">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Exit */}
          <a
            href={localHref("recipe", recipe.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-paper-2 border border-line text-sm text-ink-soft hover:text-ink active:text-ink transition-colors"
          >
            ← Exit
          </a>

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
                    : "bg-paper text-ink-soft hover:bg-paper-2 active:bg-paper-2",
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
                    : "bg-paper text-ink-soft hover:bg-paper-2 active:bg-paper-2",
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
              onTick={() => setNow(Date.now())}
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
        {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
      </div>

      {/* ── SHEETS (mobile only, rendered at root level) ──────────────── */}
      <IngredientsSheet
        open={ingredientsOpen}
        ingredients={recipe.ingredients}
        onClose={() => setIngredientsOpen(false)}
      />
      <TimerSheet
        open={timerSheetOpen}
        remainingSeconds={timerSeconds >= 0 ? timerSeconds : 0}
        running={timerRunning}
        onPauseToggle={handleTimerPause}
        onReset={handleTimerReset}
        onClose={() => setTimerSheetOpen(false)}
      />
    </>
  );
}
