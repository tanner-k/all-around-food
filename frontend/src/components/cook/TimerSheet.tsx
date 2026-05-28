"use client";

import { useEffect, useRef } from "react";
import { X, Play, Pause, RotateCcw } from "lucide-react";
import { trapTabKey } from "@/lib/focus-trap";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        clearTimeout(id);
        document.body.style.overflow = prevOverflow;
      };
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isExpired = remainingSeconds === 0;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timer"
      className="fixed inset-0 z-50 bg-paper flex flex-col"
      onKeyDown={(e) => trapTabKey(e, dialogRef.current)}
    >
      {/* Close button */}
      <div className="flex justify-end px-4 pt-4">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-2 active:bg-paper-2 active:text-ink transition-colors"
          aria-label="Close timer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Countdown */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
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

        {/* Controls */}
        <div className="flex gap-3 w-full max-w-xs">
          {!isExpired && (
            <button
              type="button"
              onClick={onPauseToggle}
              className="flex-1 min-h-14 rounded-xl bg-terra text-white font-semibold text-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:bg-[#A55230] active:bg-[#A55230]"
              aria-label={running ? "Pause timer" : "Resume timer"}
            >
              {running ? (
                <Pause className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Play className="w-6 h-6" aria-hidden="true" />
              )}
              {running ? "Pause" : "Resume"}
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="flex-1 min-h-14 rounded-xl border border-line bg-paper text-ink font-semibold text-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:bg-paper-2 active:bg-paper-2"
            aria-label="Reset timer"
          >
            <RotateCcw className="w-5 h-5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
