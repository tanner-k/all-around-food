"use client";

import { useState } from "react";

interface ShoppingAddFormProps {
  onAdd: (name: string, quantityText: string) => Promise<void>;
}

export function ShoppingAddForm({ onAdd }: ShoppingAddFormProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed, quantity.trim());
      setName("");
      setQuantity("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item…"
        className="flex-1 rounded-xl border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-terra focus:outline-none"
      />
      <input
        type="text"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="qty"
        aria-label="Quantity"
        className="w-20 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-terra focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
