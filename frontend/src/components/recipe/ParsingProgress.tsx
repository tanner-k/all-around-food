"use client";

import { useEffect, useState } from "react";

type LineState = "pending" | "active" | "done";

const DEFAULT_STEPS = [
  "Detecting source…",
  "Reading ingredients…",
  "Reading steps…",
  "Placing amounts inline…",
  "Final review",
];

interface ParsingProgressProps {
  /** When true, immediately advance all remaining lines to done */
  complete?: boolean;
  /** Override the progress step labels (e.g. for receipt parsing). */
  steps?: string[];
}

export function ParsingProgress({
  complete = false,
  steps = DEFAULT_STEPS,
}: ParsingProgressProps) {
  const [states, setStates] = useState<LineState[]>(() =>
    steps.map((_, i) => (i === 0 ? "active" : "pending"))
  );

  // Tick each line through pending → active → done on ~1.2s interval
  useEffect(() => {
    if (complete) return; // handled by the other effect below

    const interval = setInterval(() => {
      setStates((prev) => {
        const next = [...prev] as LineState[];
        const activeIdx = next.findIndex((s) => s === "active");

        if (activeIdx === -1) {
          clearInterval(interval);
          return prev;
        }

        next[activeIdx] = "done";

        const nextIdx = activeIdx + 1;
        if (nextIdx < next.length) {
          next[nextIdx] = "active";
        }

        return next;
      });
    }, 1_200);

    return () => clearInterval(interval);
  }, [complete]);

  // When parse completes, finish all remaining lines quickly
  useEffect(() => {
    if (!complete) return;

    let i = 0;
    const flush = setInterval(() => {
      setStates((prev) => {
        const next = prev.map((s) => (s === "pending" ? "done" : s)) as LineState[];
        const activeIdx = next.findIndex((s) => s === "active");
        if (activeIdx !== -1) next[activeIdx] = "done";
        return next;
      });
      if (++i >= steps.length) clearInterval(flush);
    }, 120);

    return () => clearInterval(flush);
  }, [complete, steps]);

  return (
    <div className="flex flex-col gap-3 py-4">
      {steps.map((label, idx) => {
        const state = states[idx];
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            {/* State indicator */}
            <span
              className={[
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
                state === "done"
                  ? "bg-forest border-forest border"
                  : state === "active"
                  ? "border-terra border-2"
                  : "border-line-strong border",
              ].join(" ")}
            >
              {state === "done" && (
                <svg
                  viewBox="0 0 10 10"
                  className="h-2.5 w-2.5 text-paper"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 5.5l2 2 4-4" />
                </svg>
              )}
              {state === "active" && (
                <span className="h-1.5 w-1.5 rounded-full bg-terra animate-pulse" />
              )}
            </span>

            {/* Label */}
            <span
              className={
                state === "done"
                  ? "text-forest font-medium"
                  : state === "active"
                  ? "text-ink font-medium"
                  : "text-ink-mute"
              }
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
