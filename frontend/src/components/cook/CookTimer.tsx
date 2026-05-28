"use client";

import { useEffect, useRef } from "react";

interface CookTimerProps {
  secondsLeft: number;
  running: boolean;
  onTick: (secondsLeft: number) => void;
  onPause: () => void;
  onReset: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CookTimer({
  secondsLeft,
  running,
  onTick,
  onPause,
  onReset,
}: CookTimerProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        onTick(secondsLeft - 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, secondsLeft, onTick]);

  const isExpired = secondsLeft === 0;

  if (secondsLeft < 0) {
    // Timer not started
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <span
        className={[
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border",
          isExpired
            ? "bg-terra text-white border-terra"
            : "bg-terra-soft text-terra border-transparent",
        ].join(" ")}
      >
        ⏲ {isExpired ? "Time's up" : formatTime(secondsLeft)}
      </span>
      {!isExpired && (
        <button
          type="button"
          onClick={running ? onPause : () => onTick(secondsLeft)}
          className="min-h-8 px-2 text-sm text-ink-mute hover:text-ink active:text-ink rounded transition-colors"
          aria-label={running ? "Pause timer" : "Resume timer"}
        >
          {running ? "⏸" : "▶"}
        </button>
      )}
      <button
        type="button"
        onClick={onReset}
        className="min-h-8 px-2 text-sm text-ink-mute hover:text-ink active:text-ink rounded transition-colors"
        aria-label="Reset timer"
      >
        ✕
      </button>
    </div>
  );
}
