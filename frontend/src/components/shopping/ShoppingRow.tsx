"use client";

import { X } from "lucide-react";
import type { ShoppingListItem } from "@/lib/shopping-schema";
import { CheckboxButton } from "@/components/CheckboxButton";
import { IconButton } from "@/components/ui/IconButton";

interface ShoppingRowProps {
  item: ShoppingListItem;
  onCheck: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export function ShoppingRow({ item, onCheck, onDelete }: ShoppingRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-line py-2 last:border-b-0">
      <CheckboxButton
        checked={item.checked}
        aria-label={item.name}
        onChange={(next) => onCheck(item.id, next)}
      />

      <span
        className={[
          "flex-1 capitalize",
          item.checked ? "text-ink-mute line-through" : "text-ink",
        ].join(" ")}
      >
        {item.name}
      </span>

      {item.pantry_covered && (
        <span className="rounded-full bg-forest-soft px-2 py-0.5 text-[11px] font-medium text-forest">
          in pantry
        </span>
      )}

      {item.needs_review && (
        <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] font-medium text-ink">check amount</span>
      )}

      {item.pantry_low && (
        <span className="rounded-full bg-terra-soft px-2 py-0.5 text-[11px] font-medium text-terra-strong">
          low
        </span>
      )}

      {item.quantity_text && (
        <span className="text-sm tabular-nums text-ink-mute">{item.quantity_text}</span>
      )}

      <IconButton
        aria-label={`Remove ${item.name}`}
        icon={<X size={18} />}
        onClick={() => onDelete(item.id)}
      />
    </div>
  );
}
