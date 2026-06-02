"use client";

import { useState } from "react";

interface PantryAddFormProps {
  onAdd: (name: string) => Promise<void>;
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
      await onAdd(name);
      setValue("");
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
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
