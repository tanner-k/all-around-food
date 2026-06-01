"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-sm rounded-xl border border-line bg-paper p-5 shadow-2xl mx-4">
        {title && (
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="font-serif italic text-2xl text-ink leading-tight">
              {title}
            </div>
            <button
              onClick={onClose}
              className="text-ink-mute hover:text-ink transition-colors text-lg leading-none mt-0.5"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
