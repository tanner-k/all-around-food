"use client";

import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";

const STATUS_OPTIONS: { value: PantryStatus; label: string; active: string }[] =
  [
    { value: "in_stock", label: "In stock", active: "bg-forest text-white" },
    { value: "low", label: "Low", active: "bg-warn text-white" },
    { value: "out", label: "Out", active: "bg-ink-mute text-white" },
  ];

interface PantryRowProps {
  item: PantryItem;
  onStatusChange: (id: string, status: PantryStatus) => void;
  onDelete: (id: string) => void;
}

export function PantryRow({ item, onStatusChange, onDelete }: PantryRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-b-0">
      <span className="flex-1 text-ink capitalize">{item.name}</span>

      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        {STATUS_OPTIONS.map((opt) => {
          const active = item.status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStatusChange(item.id, opt.value)}
              aria-pressed={active}
              className={[
                "px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? opt.active
                  : "bg-paper text-ink-mute hover:text-ink",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

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
