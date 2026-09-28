"use client";

import { useId, type ReactNode } from "react";
import { Button } from "./Button";
import { Overlay } from "./internal/Overlay";

export interface DialogProps {
  open: boolean;
  /** Cancel, Escape, and backdrop click. */
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  /** Confirm shows a spinner, both buttons disable, and the dialog is not dismissible. */
  busy?: boolean;
}

/** Centered confirmation dialog; replaces window.confirm. Cancel receives initial focus. */
export function Dialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  busy = false,
}: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      dismissible={!busy}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      containerClassName="flex items-center justify-center p-4"
      panelClassName="w-full max-w-sm rounded-sheet bg-paper p-6 text-ink shadow-overlay"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {description && (
        <div id={descId} className="mt-2 text-sm text-ink-soft">
          {description}
        </div>
      )}
      {/* Cancel comes first in DOM order so the Overlay focuses it on open. */}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </Overlay>
  );
}
