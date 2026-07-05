"use client";

import { useState } from "react";
import { addFromRecipesAction } from "@/app/(app)/shop/actions";

export interface RecipeOption {
  id: string;
  title: string;
}

interface AddFromRecipesModalProps {
  recipeOptions: RecipeOption[];
  onClose: () => void;
  onGenerated: () => void;
}

export function AddFromRecipesModal({
  recipeOptions,
  onClose,
  onGenerated,
}: AddFromRecipesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleGenerate() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    const result = await addFromRecipesAction([...selected]);
    if (result.ok) {
      onGenerated();
      onClose();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-ink">
          Add from <em className="italic text-terra">recipes</em>
        </h3>
        <p className="mb-4 mt-1 text-sm text-ink-mute">
          Pick recipes to build your list. Items already in your pantry are
          subtracted automatically.
        </p>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {recipeOptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-mute">
              No saved recipes yet.
            </p>
          ) : (
            recipeOptions.map((recipe) => (
              <label
                key={recipe.id}
                className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(recipe.id)}
                  onChange={() => toggle(recipe.id)}
                  className="h-4 w-4 accent-terra"
                />
                <span className="flex-1 text-sm text-ink">{recipe.title}</span>
              </label>
            ))
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || selected.size === 0}
            className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
          >
            {busy ? "Generating…" : `Generate from ${selected.size}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
