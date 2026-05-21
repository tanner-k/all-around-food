"use client";

import { useEffect, useState } from "react";
import { getPantry, setPantryItemStatus } from "@/lib/api";
import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";
import { normalizeName } from "@/lib/normalize";

const STATUS_OPTIONS: {
  value: PantryStatus;
  label: string;
  active: string;
}[] = [
  { value: "in_stock", label: "Still have", active: "bg-forest text-white" },
  { value: "low", label: "Running low", active: "bg-warn text-white" },
  { value: "out", label: "Used it up", active: "bg-ink-mute text-white" },
];

interface MarkOutOfStepProps {
  ingredientNames: string[];
  onDone: () => void;
}

interface Choice {
  item: PantryItem;
  status: PantryStatus;
}

export function MarkOutOfStep({ ingredientNames, onDone }: MarkOutOfStepProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "saving">(
    "loading"
  );
  const [choices, setChoices] = useState<Choice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPantry()
      .then((pantry) => {
        if (cancelled) return;
        const wanted = new Set(ingredientNames.map(normalizeName));
        const matched = pantry.filter((p) =>
          wanted.has(normalizeName(p.name))
        );
        setChoices(matched.map((item) => ({ item, status: item.status })));
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your pantry.");
        setPhase("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [ingredientNames]);

  function setStatus(id: string, status: PantryStatus) {
    setChoices((prev) =>
      prev.map((c) => (c.item.id === id ? { ...c, status } : c))
    );
  }

  async function handleSave() {
    setPhase("saving");
    setError(null);
    try {
      const changed = choices.filter((c) => c.status !== c.item.status);
      await Promise.all(
        changed.map((c) => setPantryItemStatus(c.item.id, c.status))
      );
      onDone();
    } catch {
      setError("Couldn't update some items. Try again.");
      setPhase("ready");
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-ink-mute">
        <span className="animate-pulse text-xl text-terra">⏳</span>
        Checking your pantry…
      </div>
    );
  }

  if (choices.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-12 text-center">
        <div>
          <h2 className="font-serif text-3xl tracking-tight text-ink">
            Pantry <em className="italic text-terra">check</em>
          </h2>
          <p className="mt-2 text-sm text-ink-mute">
            None of this recipe&apos;s ingredients are tracked in your pantry
            yet.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="min-h-14 w-full rounded-xl bg-terra font-semibold text-white transition-colors hover:bg-[#A55230]"
        >
          Finish
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div className="text-center">
        <h2 className="font-serif text-3xl tracking-tight text-ink">
          What did you <em className="italic text-terra">run out of</em>?
        </h2>
        <p className="mt-2 text-sm text-ink-mute">
          Update what&apos;s left so your shopping list stays accurate.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-paper px-4">
        {choices.map(({ item, status }) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0"
          >
            <span className="flex-1 capitalize text-ink">{item.name}</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-line">
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(item.id, opt.value)}
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
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={phase === "saving"}
          className="min-h-14 w-full rounded-xl bg-terra font-semibold text-white transition-colors hover:bg-[#A55230] disabled:opacity-60"
        >
          {phase === "saving" ? "Saving…" : "Save & finish"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={phase === "saving"}
          className="min-h-14 w-full rounded-xl border border-line bg-paper font-semibold text-ink transition-colors hover:bg-paper-2 disabled:opacity-60"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
