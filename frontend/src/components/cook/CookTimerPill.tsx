"use client";

import type { JSX } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { formatTime } from "@/lib/format-time";

export interface CookTimerPillProps {
  /** Seconds remaining; any negative value means no timer is set. */
  secondsLeft: number;
  running: boolean;
  variant: "mobile" | "desktop";
  /** Mobile: tapping the pill opens the TimerSheet. */
  onOpen?: () => void;
  /** Pause/resume toggle (desktop inline control). */
  onPause: () => void;
  /** Reset (desktop inline control). */
  onReset: () => void;
}

/**
 * Running-timer pill for the sticky top strip of cook mode.
 *
 * Replaces both the mobile bottom-bar timer chip and the desktop `CookTimer`,
 * so the timer stays visible in both layouts and in step and scroll modes.
 * It has no interval of its own: the parent re-renders every second with a
 * fresh `secondsLeft`.
 */
export function CookTimerPill({
  secondsLeft,
  running,
  variant,
  onOpen,
  onPause,
  onReset,
}: CookTimerPillProps): JSX.Element | null {
  if (secondsLeft < 0) return null;

  const expired = secondsLeft === 0;
  const time = formatTime(secondsLeft);
  const label = expired ? "Time's up" : time;
  const tone = expired
    ? "bg-terra-strong text-on-accent motion-safe:animate-pulse"
    : running
      ? "bg-terra-strong text-on-accent"
      : "bg-terra-soft text-terra-strong";
  const pill = `inline-flex items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${tone}`;
  const content = (
    <>
      <Timer className="size-4" aria-hidden="true" />
      <span className={expired ? undefined : "tabular-nums"}>{label}</span>
    </>
  );

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open timer"
        title={label}
        className={`${pill} min-h-11 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        {content}
      </button>
    );
  }

  return (
    <div role="group" aria-label="Timer" className="inline-flex items-center gap-1">
      <span className={`${pill} min-h-9`} title={label}>
        {content}
      </span>
      {!expired && (
        <IconButton
          aria-label={running ? "Pause timer" : "Resume timer"}
          icon={running ? <Pause className="size-4" /> : <Play className="size-4" />}
          onClick={onPause}
        />
      )}
      <IconButton
        aria-label="Reset timer"
        icon={<RotateCcw className="size-4" />}
        onClick={onReset}
      />
    </div>
  );
}
