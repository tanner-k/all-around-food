"use client";

import { useState } from "react";

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
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Add from recipes" className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-paper p-6" onClick={(event) => event.stopPropagation()}>
      <h3 className="font-serif text-xl text-ink">Add from <em className="italic text-terra">recipes</em></h3>
      <p className="mb-4 mt-1 text-sm text-ink-mute">Pick saved recipes to add their ingredients to this list.</p>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">{recipeOptions.length === 0 ? <p className="py-6 text-center text-sm text-ink-mute">No saved recipes yet.</p> : recipeOptions.map((recipe) => <label key={recipe.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"><input type="checkbox" checked={selected.has(recipe.id)} onChange={() => toggle(recipe.id)} className="h-4 w-4 accent-terra" /><span className="flex-1 text-sm text-ink">{recipe.title}</span></label>)}</div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex gap-3"><button type="button" onClick={() => void handleGenerate()} disabled={busy || !selected.size} className="min-h-11 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Generating…" : `Generate from ${selected.size}`}</button><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink">Cancel</button></div>
    </div>
  </div>;
}
