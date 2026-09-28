"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

export interface RecipeOption { id: string; title: string }
interface AddFromRecipesModalProps {
  recipeOptions: RecipeOption[];
  onClose: () => void;
  onGenerate: (recipeIds: string[]) => Promise<void>;
}

export function AddFromRecipesModal({ recipeOptions, onClose, onGenerate }: AddFromRecipesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function toggle(id: string) {
    setSelected((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function handleGenerate() {
    if (!selected.size || busy) return;
    setBusy(true); setError(null);
    try { await onGenerate([...selected]); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add recipes."); setBusy(false); }
  }
  return <Sheet open onClose={onClose} aria-label="Add from recipes">
    <div className="flex flex-col p-6">
      <h3 className="font-serif text-xl text-ink">Add from <em className="italic text-terra">recipes</em></h3>
      <p className="mb-4 mt-1 text-sm text-ink-mute">Pick saved recipes to add their ingredients to this list.</p>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">{recipeOptions.length === 0 ? <p className="py-6 text-center text-sm text-ink-mute">No saved recipes yet.</p> : recipeOptions.map((recipe) => <label key={recipe.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"><input type="checkbox" checked={selected.has(recipe.id)} onChange={() => toggle(recipe.id)} className="h-4 w-4 accent-terra" /><span className="flex-1 text-sm text-ink">{recipe.title}</span></label>)}</div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex gap-3"><Button onClick={() => void handleGenerate()} disabled={busy || !selected.size}>{busy ? "Generating…" : `Generate from ${selected.size}`}</Button><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button></div>
    </div>
  </Sheet>;
}
