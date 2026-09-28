"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface PantryAddFormProps {
  onAdd: (name: string) => Promise<boolean>;
}

export function PantryAddForm({ onAdd }: PantryAddFormProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      if (await onAdd(name)) setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add an item to your pantry…"
        className="flex-1 rounded-xl border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-terra focus:outline-none"
      />
      <Button type="submit" disabled={busy || !value.trim()}>
        Add
      </Button>
    </form>
  );
}
