"use client";

import { useState } from "react";
import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";
import { captureLocalAccount, isCurrentLocalAccount } from "@/lib/local/db";
import { normalizeName } from "@/lib/normalize";
import { Button } from "@/components/ui/Button";

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
  pantry: PantryItem[];
  onSetPantryStatus: (id: string, status: PantryStatus) => Promise<void>;
  onDone: () => void;
}

interface Choice {
  item: PantryItem;
  status: PantryStatus;
}

export function MarkOutOfStep({ ingredientNames, pantry, onSetPantryStatus, onDone }: MarkOutOfStepProps) {
  const [account] = useState(captureLocalAccount);
  const finish = () => { if (isCurrentLocalAccount(account)) onDone(); };
  const [phase, setPhase] = useState<"ready" | "saving">("ready");
  const [choices, setChoices] = useState<Choice[]>(() => {
    const wanted = new Set(ingredientNames.map(normalizeName));
    return pantry.filter((item) => wanted.has(normalizeName(item.name))).map((item) => ({ item, status: item.status }));
  });
  const [error, setError] = useState<string | null>(null);

  function setStatus(id: string, status: PantryStatus) {
    setChoices((prev) =>
      prev.map((c) => (c.item.id === id ? { ...c, status } : c))
    );
  }

  async function handleSave() {
    if (!isCurrentLocalAccount(account)) return;
    setPhase("saving");
    setError(null);
    try {
      const changed = choices.filter((c) => c.status !== c.item.status);
      await Promise.all(
        changed.map((c) => onSetPantryStatus(c.item.id, c.status))
      );
      finish();
    } catch {
      setError("Couldn't update some items. Try again.");
      setPhase("ready");
    }
  }

  if (choices.length === 0) {
    return (
      <div className="animate-rise mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-12 text-center">
        <div>
          <h2 className="font-serif text-3xl tracking-tight text-ink">
            Pantry <em className="italic text-terra">check</em>
          </h2>
          <p className="mt-2 text-sm text-ink-mute">
            None of this recipe&apos;s ingredients are tracked in your pantry
            yet.
          </p>
        </div>
        <Button size="lg" fullWidth onClick={finish}>
          Finish
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-rise mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div className="text-center">
        <h2 className="font-serif text-3xl tracking-tight text-ink">
          What did you <em className="italic text-terra">run out of</em>?
        </h2>
        <p className="mt-2 text-sm text-ink-mute">
          Update what&apos;s left so your shopping list stays accurate.
        </p>
      </div>

      <div className="rounded-card border border-line bg-paper px-4">
        {choices.map(({ item, status }) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0"
          >
            <span className="flex-1 capitalize text-ink">{item.name}</span>
            <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-lg border border-line">
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(item.id, opt.value)}
                    aria-pressed={active}
                    className={[
                      "min-h-10 px-3 text-sm font-medium transition-colors",
                      active
                        ? opt.active
                        : "bg-paper text-ink-mute hover:text-ink active:text-ink hover:bg-paper-2 active:bg-paper-2",
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
        <p className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button size="lg" fullWidth onClick={handleSave} disabled={phase === "saving"}>
          {phase === "saving" ? "Saving…" : "Save & finish"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onClick={finish}
          disabled={phase === "saving"}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
