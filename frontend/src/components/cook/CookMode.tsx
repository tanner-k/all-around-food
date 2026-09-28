"use client";

import { useState, useEffect, useMemo, useRef, type TouchEvent } from "react";
import { MonitorCheck, Moon, Sun, X } from "lucide-react";
import type { Recipe } from "@/lib/recipe-schema";
import { CookStepView } from "./CookStepView";
import { CookScrollView } from "./CookScrollView";
import { CookTimerPill } from "./CookTimerPill";
import { CookDoneView } from "./CookDoneView";
import { IngredientsSheet } from "./IngredientsSheet";
import { TimerSheet } from "./TimerSheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useScreenWakeLock } from "@/lib/wake-lock";
import type { CookProgress, CookProgressPatch } from "@/lib/local/schema";
import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";
import { localHref } from "@/lib/local/navigation";

type Layout = "step" | "scroll";

const SWIPE_MIN_PX = 60;

function ScreenOnPill() {
  return (
    <span title="Screen stays on" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-forest-soft px-2 py-0.5 text-xs font-medium text-forest">
      <MonitorCheck className="size-3.5" aria-hidden="true" />
      {/* Icon-only on the narrowest phones so the top strip never overflows. */}
      <span className="max-[389px]:sr-only">Screen stays on</span>
    </span>
  );
}

function KitchenToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <IconButton
      aria-label="Dark kitchen mode"
      aria-pressed={dark}
      title={dark ? "Switch to light" : "Switch to dark kitchen mode"}
      icon={dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      onClick={onToggle}
    />
  );
}

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

  // Keep the screen on until the completion screen; a rejected first request
  // (no user activation, power saving) retries on the next tap in cook mode.
  const wakeLock = useScreenWakeLock(!done);

  // Session-only dark "kitchen" presentation. Mirrored onto <body> so the
  // portaled sheets and the page background match the cook root.
  const [kitchenDark, setKitchenDark] = useState(false);
  useEffect(() => {
    if (!kitchenDark) return;
    document.body.dataset.cookTheme = "dark";
    return () => { delete document.body.dataset.cookTheme; };
  }, [kitchenDark]);

  // Arrow keys and swipes move between steps. They never finish the recipe,
  // and do nothing while a sheet is open, in scroll layout, or when typing.
  const sheetOpen = ingredientsOpen || timerSheetOpen;
  const gesturesEnabled = !done && !sheetOpen;
  const navRef = useRef({ prev: handlePrev, next: handleNext });
  useEffect(() => { navRef.current = { prev: handlePrev, next: handleNext }; });
  const canAdvance = currentStep < total - 1;

  useEffect(() => {
    if (!gesturesEnabled || layout === "scroll") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft") navRef.current.prev();
      else if (e.key === "ArrowRight" && canAdvance) navRef.current.next();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gesturesEnabled, layout, canAdvance]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    touchStart.current = e.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  function handleTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch || !gesturesEnabled) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Mostly horizontal and deliberate, so vertical scrolling never turns the page.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && canAdvance) handleNext();
    else if (dx > 0) handlePrev();
  }

  // Progress percentage
  const progressPct =
    layout === "step" ? ((currentStep + 1) / total) * 100 : 100;

  const timerPillProps = {
    secondsLeft: timerSeconds,
    running: timerRunning,
    onPause: handleTimerPause,
    onReset: handleTimerReset,
  };
  const toggleKitchen = () => setKitchenDark((dark) => !dark);

  return (
    <div
      data-cook-root=""
      data-cook-theme={kitchenDark ? "dark" : undefined}
      className="bg-bg text-ink"
      onPointerDown={wakeLock.retry}
    >
      {done ? (
        <CookDoneView
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          stepCount={total}
          ingredientNames={ingredientNames}
          pantry={pantry}
          onSetPantryStatus={onSetPantryStatus}
          onComplete={() => onComplete(progress.session_id!)}
        />
      ) : (
        <>
          {/* ── MOBILE LAYOUT (below md) ─────────────────────────────────── */}
          <div className="md:hidden flex flex-col min-h-[100dvh]">
            {/* Sticky top strip */}
            <div className="sticky top-0 z-20 flex items-center gap-1 min-h-14 px-1.5 pt-[env(safe-area-inset-top)] bg-paper/85 backdrop-blur border-b border-line">
              <a
                href={localHref("recipe", recipe.id)}
                className="flex items-center justify-center size-11 shrink-0 rounded-control text-ink-soft hover:text-ink active:text-ink hover:bg-paper-2 active:bg-paper-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                aria-label="Exit cook mode"
              >
                <X className="size-5" aria-hidden="true" />
              </a>
              <div className="flex flex-1 min-w-0 items-center gap-2">
                <span className="text-sm font-semibold text-ink tabular-nums whitespace-nowrap">
                  {currentStep + 1} / {total}
                </span>
                {wakeLock.active && <ScreenOnPill />}
              </div>
              <CookTimerPill {...timerPillProps} variant="mobile" onOpen={() => setTimerSheetOpen(true)} />
              <KitchenToggle dark={kitchenDark} onToggle={toggleKitchen} />
            </div>

            {/* Progress bar */}
            <div className="h-[3px] bg-paper-2 overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-terra transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Step content — fills space between top strip and bottom bar; swipe to change steps */}
            <div
              className="flex-1 overflow-y-auto pb-4"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
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
              <div className="grid grid-cols-2 gap-3 px-3 py-2.5">
                <Button variant="secondary" size="lg" onClick={handlePrev} disabled={currentStep === 0}>
                  <span aria-hidden="true">←</span> Prev
                </Button>
                <Button size="lg" onClick={handleNext}>
                  {currentStep >= total - 1 ? "Finish" : "Next"} <span aria-hidden="true">→</span>
                </Button>
              </div>
            </div>
          </div>

          {/* ── DESKTOP LAYOUT (md+) ─────────────────────────────────────── */}
          <div className="hidden md:flex flex-col gap-6 min-h-[calc(100dvh-80px)]">
            {/* Top bar */}
            <div className="sticky top-0 z-20 -mx-2 px-2 py-3 flex items-center justify-between gap-3 flex-wrap bg-bg/85 backdrop-blur">
              <Button variant="secondary" size="sm" href={localHref("recipe", recipe.id)}>
                <span aria-hidden="true">←</span> Exit
              </Button>

              {/* Step counter + layout toggle */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-mute tabular-nums">
                  Step {currentStep + 1} of {total}
                </span>
                {wakeLock.active && <ScreenOnPill />}

                {/* Layout toggle */}
                <div className="flex rounded-full border border-line overflow-hidden text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => handleLayoutChange("step")}
                    aria-pressed={layout === "step"}
                    className={[
                      "min-h-8 px-3 py-1 transition-colors",
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
                    aria-pressed={layout === "scroll"}
                    className={[
                      "min-h-8 px-3 py-1 transition-colors",
                      layout === "scroll"
                        ? "bg-terra text-white"
                        : "bg-paper text-ink-soft hover:bg-paper-2 active:bg-paper-2",
                    ].join(" ")}
                  >
                    Scroll
                  </button>
                </div>
              </div>

              {/* Timer + kitchen toggle */}
              <div className="flex items-center gap-1 min-w-20 justify-end">
                <CookTimerPill {...timerPillProps} variant="desktop" />
                <KitchenToggle dark={kitchenDark} onToggle={toggleKitchen} />
              </div>
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
            {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
          </div>

          {/* ── SHEETS (mobile only, portaled to <body>) ──────────────────── */}
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
      )}
    </div>
  );
}
