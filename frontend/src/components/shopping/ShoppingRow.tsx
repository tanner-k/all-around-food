"use client";

import type { ShoppingListItem } from "@/lib/shopping-schema";

interface ShoppingRowProps {
  item: ShoppingListItem;
  onCheck: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export function ShoppingRow({ item, onCheck, onDelete }: ShoppingRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-line py-2 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.name}
        onClick={() => onCheck(item.id, !item.checked)}
        className={[
          "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors",
          item.checked
            ? "border-terra bg-terra text-white"
            : "border-line-strong bg-paper",
        ].join(" ")}
      >
        {item.checked && (
          <svg
            viewBox="0 0 10 10"
            className="h-2.5 w-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 5.5l2 2 4-4" />
          </svg>
        )}
      </button>

      <span
        className={[
          "flex-1 capitalize",
          item.checked ? "text-ink-mute line-through" : "text-ink",
        ].join(" ")}
      >
        {item.name}
      </span>

      {item.pantry_covered && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
          in pantry
        </span>
      )}

      {item.pantry_low && (
        <span className="rounded-full bg-terra-soft px-2 py-0.5 text-[11px] font-medium text-terra">
          low
        </span>
      )}

      {item.quantity_text && (
        <span className="text-sm text-ink-mute">{item.quantity_text}</span>
      )}

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={`Remove ${item.name}`}
        className="px-1 text-lg leading-none text-ink-mute transition-colors hover:text-terra"
      >
        ×
      </button>
    </div>
  );
}
