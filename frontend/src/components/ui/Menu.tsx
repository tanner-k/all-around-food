"use client";

import { Ellipsis } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconButton } from "./IconButton";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  /** Accessible name for the trigger button (required; triggers are usually an icon like "⋯"). */
  label: string;
  /** Content of the trigger button; defaults to a lucide-react `Ellipsis` icon. */
  trigger?: ReactNode;
  items: MenuItem[];
  /** Horizontal alignment of the popover relative to the trigger. Default "end". */
  align?: "start" | "end";
}

const popoverBase =
  "absolute top-full z-40 mt-1 min-w-44 rounded-card border border-line bg-paper py-1 shadow-raised";

const popoverMotion =
  "transition-[opacity,scale] duration-(--duration-fast) ease-(--ease-out-soft) starting:opacity-0 starting:scale-95";

const itemBase =
  "flex min-h-11 w-full items-center px-4 text-left text-sm transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

/**
 * "⋯" action menu. V1 is click + Escape only (no arrow-key roving tabindex);
 * items are real buttons reachable with Tab.
 */
export function Menu({ label, trigger, items, align = "end" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)'
    );
    first?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRefocus();
      }
    }
    function onPointerDown(event: Event) {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target))
        return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, closeAndRefocus]);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <IconButton
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        icon={trigger ?? <Ellipsis size={20} />}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={[
            popoverBase,
            popoverMotion,
            align === "start" ? "left-0 origin-top-left" : "right-0 origin-top-right",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {items.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={[itemBase, item.danger ? "text-danger" : "text-ink"]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (item.disabled) return;
                closeAndRefocus();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
