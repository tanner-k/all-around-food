"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface ShoppingAddFormProps {
  onAdd: (name: string, quantityText: string) => Promise<boolean>;
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
      if (await onAdd(trimmed, quantity.trim())) {
        setName("");
        setQuantity("");
      }
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
      <Button type="submit" disabled={busy || !name.trim()}>
        Add
      </Button>
    </form>
  );
}
