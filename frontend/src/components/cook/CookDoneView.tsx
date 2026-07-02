"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarkOutOfStep } from "./MarkOutOfStep";
import { markCookedAction } from "@/app/(app)/cookbook/actions";

interface CookDoneViewProps {
  recipeId: string;
  recipeTitle: string;
  stepCount: number;
  ingredientNames: string[];
}

export function CookDoneView({
  recipeId,
  recipeTitle,
  stepCount,
  ingredientNames,
}: CookDoneViewProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"done" | "stockCheck">("done");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMarkCooked() {
    setLoading(true);
    setError(null);
    try {
      const result = await markCookedAction(recipeId);
      if ("error" in result) {
        throw new Error(result.error);
      }
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
        onDone={() => router.push(`/cookbook/${recipeId}`)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-12 px-4 text-center max-w-md mx-auto">
      {/* Heading */}
      <div>
        <h1 className="font-serif text-3xl md:text-5xl leading-tight tracking-tight text-ink">
          Nicely{" "}
          <em className="italic text-terra">done.</em>
        </h1>
        <p className="text-ink-mute mt-3 text-sm">
          {recipeTitle} · {stepCount} step{stepCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
            {error} — please try again.
          </p>
        )}
        <button
          type="button"
          onClick={handleMarkCooked}
          disabled={loading}
          className="w-full min-h-14 rounded-xl bg-terra text-white font-semibold text-base transition-colors hover:bg-[#A55230] active:bg-[#A55230] disabled:opacity-60"
        >
          {loading ? "Saving…" : "Mark as cooked"}
        </button>
        <Link
          href={`/cookbook/${recipeId}`}
          className="w-full min-h-14 rounded-xl border border-line bg-paper text-ink font-semibold text-base flex items-center justify-center transition-colors hover:bg-paper-2 active:bg-paper-2"
        >
          Back to recipe
        </Link>
      </div>
    </div>
  );
}
