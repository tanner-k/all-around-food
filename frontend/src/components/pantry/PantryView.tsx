"use client";

import { useState } from "react";
import {
  createPantryItem,
  deletePantryItem,
  getPantry,
  setPantryItemStatus,
} from "@/lib/api";
import {
  AisleSchema,
  type PantryItem,
  type PantryStatus,
} from "@/lib/pantry-schema";
import { PantryAddForm } from "./PantryAddForm";
import { PantryRow } from "./PantryRow";
import { ReceiptImportFlow } from "./ReceiptImportFlow";

interface PantryViewProps {
  initialItems: PantryItem[];
}

export function PantryView({ initialItems }: PantryViewProps) {
  const [items, setItems] = useState<PantryItem[]>(initialItems);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await getPantry());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pantry");
    }
  }

  async function handleAdd(name: string) {
    setError(null);
    try {
      const created = await createPantryItem(name);
      setItems((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  async function handleStatusChange(id: string, status: PantryStatus) {
    setError(null);
    const previous = items;
    setItems((cur) =>
      cur.map((i) => (i.id === id ? { ...i, status } : i))
    );
    try {
      await setPantryItemStatus(id, status);
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const previous = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    try {
      await deletePantryItem(id);
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Failed to remove item");
    }
  }

  const groups = AisleSchema.options
    .map((aisle) => ({
      aisle,
      items: items
        .filter((i) => i.aisle === aisle)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-start gap-3">
        <PantryAddForm onAdd={handleAdd} />
        <button
          type="button"
          onClick={() => setReceiptOpen((v) => !v)}
          className="rounded-xl border border-line bg-paper-2 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra"
        >
          {receiptOpen ? "Hide receipt upload" : "📷 Upload receipt"}
        </button>
      </div>

      {receiptOpen && <ReceiptImportFlow onImported={refresh} />}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Inventory */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute">
          Your pantry is empty. Add items above or upload a receipt.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.aisle}>
              <h2 className="mb-1 font-serif text-lg italic text-ink">
                {group.aisle}{" "}
                <span className="text-sm not-italic text-ink-mute">
                  {group.items.length}
                </span>
              </h2>
              <div className="rounded-xl border border-line bg-paper px-4">
                {group.items.map((item) => (
                  <PantryRow
                    key={item.id}
                    item={item}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
