"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MarkOutOfStep } from "./MarkOutOfStep";
import type { PantryItem, PantryStatus } from "@/lib/pantry-schema";
import { localHref } from "@/lib/local/navigation";

interface CookDoneViewProps {
  recipeId: string;
  recipeTitle: string;
  stepCount: number;
  ingredientNames: string[];
  pantry: PantryItem[];
  onSetPantryStatus: (id: string, status: PantryStatus) => Promise<void>;
  onComplete: () => Promise<boolean>;
}

export function CookDoneView({
  recipeId,
  recipeTitle,
  stepCount,
  ingredientNames,
  pantry,
  onSetPantryStatus,
  onComplete,
}: CookDoneViewProps) {
  const [phase, setPhase] = useState<"done" | "stockCheck">("done");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMarkCooked() {
    setLoading(true);
    setError(null);
    try {
      await onComplete();
      setPhase("stockCheck");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "stockCheck") {
    return (
      <MarkOutOfStep
        ingredientNames={ingredientNames}
        pantry={pantry}
        onSetPantryStatus={onSetPantryStatus}
        onDone={() => { window.location.href = localHref("recipe", recipeId); }}
      />
    );
  }

  return (
    <div className="animate-rise flex flex-col items-center justify-center gap-10 py-16 md:py-24 px-4 text-center max-w-md mx-auto min-h-[70dvh]">
      {/* Heading */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute tabular-nums">
          {stepCount} step{stepCount !== 1 ? "s" : ""} · all done
        </p>
        <h1 className="mt-4 font-serif text-5xl md:text-6xl leading-tight tracking-tight text-ink">
          Nicely{" "}
          <em className="italic text-terra">done.</em>
        </h1>
        <p className="text-ink-mute mt-3 text-base text-balance">
          {recipeTitle}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full">
        {error && (
          <p role="alert" className="text-sm text-danger bg-danger-soft rounded-control px-4 py-2">
            {error} — please try again.
          </p>
        )}
        <Button size="lg" fullWidth onClick={handleMarkCooked} loading={loading}>
          {loading ? "Saving…" : "Mark as cooked"}
        </Button>
        <Button variant="secondary" size="lg" fullWidth href={localHref("recipe", recipeId)}>
          Back to recipe
        </Button>
      </div>
    </div>
  );
}
