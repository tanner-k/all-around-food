"use client";

import { useEffect, useRef } from "react";
import { X, List } from "lucide-react";
import type { Ingredient } from "@/lib/recipe-schema";
import { trapTabKey } from "@/lib/focus-trap";

interface IngredientsSheetProps {
  open: boolean;
  ingredients: Ingredient[];
  onClose: () => void;
}

function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {ingredients.map((ing, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm">
          <span className="text-ink-mute">·</span>
          <span className="text-ink">{ing.name}</span>
          {ing.quantity.as_written && (
            <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap">
              {ing.quantity.as_written}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IngredientsSheet({
  open,
  ingredients,
  onClose,
}: IngredientsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Small delay to let the sheet render before focusing
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ingredients"
        className="fixed bottom-0 left-0 right-0 z-50 h-[60vh] rounded-t-2xl bg-paper border-t border-line flex flex-col"
        onKeyDown={(e) => trapTabKey(e, dialogRef.current)}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-line" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line flex-shrink-0">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-ink-soft" aria-hidden="true" />
            <span className="text-sm font-semibold text-ink">
              Ingredients ({ingredients.length})
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-paper-2 active:bg-paper-2 active:text-ink transition-colors"
            aria-label="Close ingredients"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          <IngredientList ingredients={ingredients} />
        </div>
      </div>
    </>
  );
}

/** Floating trigger button — shown only on mobile (md:hidden) */
export function IngredientsSheetTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper border border-line text-xs font-medium text-ink-soft shadow-sm hover:text-ink hover:bg-paper-2 active:bg-paper-2 active:text-ink transition-colors"
      aria-label="Show ingredients"
    >
      <List className="w-3.5 h-3.5" aria-hidden="true" />
      Ingredients
    </button>
  );
}
