"use client";

import type { ShoppingListItem } from "@/lib/shopping-schema";
import { ShoppingRow } from "./ShoppingRow";

interface AisleSectionProps {
  aisle: string;
  items: ShoppingListItem[];
  onCheck: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export function AisleSection({
  aisle,
  items,
  onCheck,
  onDelete,
}: AisleSectionProps) {
  return (
    <section>
      <h2 className="mb-1 font-serif text-lg italic text-ink">
        {aisle}{" "}
        <span className="text-sm not-italic text-ink-mute">{items.length}</span>
      </h2>
      <div className="rounded-xl border border-line bg-paper px-4">
        {items.map((item) => (
          <ShoppingRow
            key={item.id}
            item={item}
            onCheck={onCheck}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}
