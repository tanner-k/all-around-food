"use client";

import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { trapTabKey } from "@/lib/focus-trap";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Exactly one accessible-name source is required. */
export type OverlayLabelProps =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

export type OverlayProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, backdrop clicks and Escape do not close. */
  dismissible?: boolean;
  role?: "dialog" | "alertdialog";
  "aria-describedby"?: string;
  /** Positions the panel inside the fixed inset-0 container. */
  containerClassName?: string;
  panelClassName?: string;
} & OverlayLabelProps;

// Open overlays, most recent last; only the topmost handles Escape.
const stack: object[] = [];

export function Overlay({
  open,
  onClose,
  children,
  initialFocusRef,
  dismissible = true,
  role = "dialog",
  containerClassName,
  panelClassName,
  ...aria
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  // initialFocusRef is read once on open, so it is intentionally not a dependency.
  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || stack[stack.length - 1] !== token) return;
      if (dismissibleRef.current) onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      stack.splice(stack.indexOf(token), 1);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function onBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && dismissible) onClose();
  }

  return createPortal(
    <div
      data-overlay-backdrop=""
      className={["fixed inset-0 z-50 bg-ink/40", containerClassName]
        .filter(Boolean)
        .join(" ")}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        tabIndex={-1}
        {...aria}
        className={["focus:outline-none", panelClassName]
          .filter(Boolean)
          .join(" ")}
        onKeyDown={(e) => trapTabKey(e, panelRef.current)}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
