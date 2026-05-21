"use client";

import { useState } from "react";
import type { ReceiptParse } from "@/lib/shopping-schema";

interface ReceiptReviewProps {
  parsed: ReceiptParse;
  onConfirm: (names: string[]) => Promise<void>;
  onCancel: () => void;
}

interface Row {
  name: string;
  quantityText: string | null;
  included: boolean;
}

export function ReceiptReview({
  parsed,
  onConfirm,
  onCancel,
}: ReceiptReviewProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    parsed.items.map((i) => ({
      name: i.name,
      quantityText: i.quantity_text,
      included: true,
    }))
  );
  const [busy, setBusy] = useState(false);

  const includedCount = rows.filter(
    (r) => r.included && r.name.trim()
  ).length;

  function setName(idx: number, name: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, name } : r))
    );
  }

  function toggle(idx: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, included: !r.included } : r))
    );
  }

  async function handleConfirm() {
    const names = rows
      .filter((r) => r.included)
      .map((r) => r.name.trim())
      .filter(Boolean);
    if (!names.length || busy) return;
    setBusy(true);
    try {
      await onConfirm(names);
    } finally {
      setBusy(false);
    }
  }

  if (parsed.items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6">
        <p className="text-ink-mute">
          No grocery items were found on that receipt. Try a clearer photo.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
        >
          Try another
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <h3 className="font-serif text-xl text-ink">
        Found <em className="italic text-terra">{parsed.items.length}</em>{" "}
        {parsed.items.length === 1 ? "item" : "items"}
      </h3>
      <p className="mb-4 mt-1 text-sm text-ink-mute">
        {parsed.store ? `${parsed.store} · ` : ""}Uncheck anything you don&apos;t
        want, then add to your pantry.
      </p>

      <div className="flex flex-col">
        {rows.map((row, idx) => (
          <label
            key={idx}
            className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <input
              type="checkbox"
              checked={row.included}
              onChange={() => toggle(idx)}
              className="h-4 w-4 accent-terra"
            />
            <input
              type="text"
              value={row.name}
              onChange={(e) => setName(idx, e.target.value)}
              className={[
                "flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink focus:border-terra focus:outline-none",
                row.included ? "" : "opacity-40",
              ].join(" ")}
            />
            {row.quantityText && (
              <span className="text-xs text-ink-mute">{row.quantityText}</span>
            )}
          </label>
        ))}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || includedCount === 0}
          className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
        >
          {busy
            ? "Adding…"
            : `Add ${includedCount} to pantry`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
