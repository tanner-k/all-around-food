"use client";

import { useRef } from "react";
import { X, Play, Pause, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { formatTime } from "@/lib/format-time";

interface TimerSheetProps {
  open: boolean;
  remainingSeconds: number;
  running: boolean;
  onPauseToggle: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function TimerSheet({
  open,
  remainingSeconds,
  running,
  onPauseToggle,
  onReset,
  onClose,
}: TimerSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isExpired = remainingSeconds === 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      aria-label="Timer"
      size="md"
      initialFocusRef={closeButtonRef}
    >
      <div className="flex items-center justify-between pl-5 pr-2 pt-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          Timer
        </span>
        <IconButton
          ref={closeButtonRef}
          aria-label="Close timer"
          icon={<X className="size-5" />}
          onClick={onClose}
        />
      </div>

      <div className="flex justify-center px-5 pb-8 pt-4">
        <div
          className={[
            "text-[80px] font-mono font-bold leading-none tabular-nums",
            isExpired ? "text-terra" : "text-ink",
          ].join(" ")}
          aria-live="polite"
          aria-atomic="true"
        >
          {isExpired ? "Done!" : formatTime(remainingSeconds)}
        </div>
      </div>

      <div className="flex gap-3 px-5 pb-2">
        {!isExpired && (
          <Button
            size="lg"
            className="flex-1"
            onClick={onPauseToggle}
            aria-label={running ? "Pause timer" : "Resume timer"}
          >
            {running ? (
              <Pause className="size-5" aria-hidden="true" />
            ) : (
              <Play className="size-5" aria-hidden="true" />
            )}
            {running ? "Pause" : "Resume"}
          </Button>
        )}
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          onClick={onReset}
          aria-label="Reset timer"
        >
          <RotateCcw className="size-5" aria-hidden="true" />
          Reset
        </Button>
      </div>
    </Sheet>
  );
}
