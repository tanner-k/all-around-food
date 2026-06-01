"use client";

import { useEffect, useState, useCallback } from "react";

export interface CookStep {
  id: string;
  position: number;
  text: string;
}

interface CookViewProps {
  title: string;
  steps: CookStep[];
}

export function CookView({ title, steps }: CookViewProps) {
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);

  const totalSteps = steps.length;
  const hasSteps = totalSteps > 0;

  const goNext = useCallback(() => {
    if (!hasSteps) return;
    if (current >= totalSteps - 1) {
      setFinished(true);
    } else {
      setCurrent((c) => c + 1);
    }
  }, [current, totalSteps, hasSteps]);

  const goPrev = useCallback(() => {
    if (!hasSteps) return;
    if (finished) {
      setFinished(false);
      return;
    }
    if (current > 0) {
      setCurrent((c) => c - 1);
    }
  }, [current, finished, hasSteps]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  // Wake Lock — keep the screen on while cooking
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let wakeLock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        wakeLock = await (navigator.wakeLock as WakeLock).request("screen");
      } catch {
        // Wake Lock is optional; silently swallow errors (e.g. jsdom, low battery)
      }
    };
    void acquire();
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!hasSteps) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-paper px-8 py-20 text-center">
        <p className="text-2xl font-serif text-ink-mute">No steps yet</p>
        <p className="text-ink-mute text-sm max-w-xs">
          This recipe doesn&apos;t have any steps added. Add steps in the
          cookbook to start cooking.
        </p>
      </div>
    );
  }

  const progressPercent = finished
    ? 100
    : Math.round(((current + 1) / totalSteps) * 100);

  // ── Finished state ───────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="flex flex-col items-center gap-8 rounded-xl border border-line bg-paper px-8 py-20 text-center">
        {/* Progress bar — full */}
        <div className="w-full max-w-lg">
          <div className="flex justify-between text-xs text-ink-mute mb-2">
            <span>Done!</span>
            <span>{totalSteps} of {totalSteps}</span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-terra-soft"
            role="progressbar"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-terra transition-all duration-300 w-full" />
          </div>
        </div>

        <div
          className="font-serif italic text-terra leading-[0.8] tracking-tight select-none"
          style={{ fontSize: "80px" }}
          aria-hidden
        >
          ✓
        </div>

        <div>
          <h2 className="font-serif text-ink tracking-tight mb-2" style={{ fontSize: "36px" }}>
            Enjoy your meal!
          </h2>
          <p className="text-ink-soft text-base">
            You&apos;ve completed all steps for{" "}
            <span className="text-ink font-medium">{title}</span>.
          </p>
        </div>

        <button
          onClick={goPrev}
          className="rounded-full border border-line-strong px-5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          ← Back to last step
        </button>
      </div>
    );
  }

  const step = steps[current];

  // ── Cook step view ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-8">
      {/* Progress header */}
      <div className="w-full max-w-2xl">
        <div className="flex justify-between text-xs font-semibold uppercase tracking-[0.1em] text-ink-mute mb-2">
          <span>Step {current + 1} of {totalSteps}</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          className="h-1.5 w-full rounded-full bg-terra-soft"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Step ${current + 1} of ${totalSteps}`}
        >
          <div
            className="h-full rounded-full bg-terra transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step card */}
      <div className="w-full max-w-2xl rounded-xl border border-line bg-paper px-10 py-12 text-center">
        {/* Step number — large serif accent */}
        <div
          className="font-serif italic text-terra leading-[0.8] tracking-tight mb-6 select-none"
          style={{ fontSize: "72px" }}
          aria-hidden
        >
          {current + 1}
        </div>

        {/* Step text */}
        <p className="text-ink leading-relaxed" style={{ fontSize: "22px" }}>
          {step.text}
        </p>
      </div>

      {/* Navigation controls */}
      <div className="flex w-full max-w-2xl items-center justify-between gap-4">
        <button
          onClick={goPrev}
          disabled={current === 0}
          aria-label="Previous step"
          className="rounded-full border border-line-strong px-6 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
        >
          ← Previous
        </button>

        <span className="text-xs text-ink-mute">
          Use arrow keys or space to navigate
        </span>

        <button
          onClick={goNext}
          aria-label={current >= totalSteps - 1 ? "Finish recipe" : "Next step"}
          className="rounded-full bg-terra px-6 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-terra/90"
        >
          {current >= totalSteps - 1 ? "Finish ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}
