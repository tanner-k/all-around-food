"use client";

import { useState } from "react";
import { AisleSchema, type PantryItem, type PantryStatus } from "@/lib/pantry-schema";
import { PantryAddForm } from "./PantryAddForm";
import { PantryRow } from "./PantryRow";

interface PantryViewProps {
  items: PantryItem[];
  onAdd: (name: string) => Promise<unknown>;
  onStatusChange: (id: string, status: PantryStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PantryView({ items, onAdd, onStatusChange, onDelete }: PantryViewProps) {
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try { await action(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update pantry."); return false; }
  }
  const groups = AisleSchema.options.map((aisle) => ({
    aisle, items: items.filter((item) => item.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);

  return <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start gap-3"><PantryAddForm onAdd={(name) => run(() => onAdd(name))} /></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
    {groups.length === 0 ? <div className="rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute">Your pantry is empty. Add items above.</div> :
      <div className="flex flex-col gap-8">{groups.map((group) => <section key={group.aisle}>
        <h2 className="mb-1 font-serif text-lg italic text-ink">{group.aisle} <span className="text-sm not-italic text-ink-mute">{group.items.length}</span></h2>
        <div className="rounded-xl border border-line bg-paper px-4">{group.items.map((item) => <PantryRow key={item.id} item={item}
          onStatusChange={(id, status) => void run(() => onStatusChange(id, status))}
          onDelete={(id) => void run(() => onDelete(id))} />)}</div>
      </section>)}</div>}
  </div>;
}
