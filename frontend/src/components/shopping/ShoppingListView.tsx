"use client";

import { useState } from "react";
import type { ShoppingListItem } from "@/lib/shopping-schema";
import { buildShoppingListResponse } from "@/lib/shopping-logic";
import { AisleSection } from "./AisleSection";
import { ShoppingAddForm } from "./ShoppingAddForm";
import { AddFromRecipesModal, type RecipeOption } from "./AddFromRecipesModal";

interface ShoppingListViewProps {
  items: ShoppingListItem[];
  recipeOptions: RecipeOption[];
  onAdd: (name: string, quantity: string) => Promise<unknown>;
  onAddRecipes: (ids: string[]) => Promise<void>;
  onCheck: (id: string, checked: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onComplete: (ids: string[]) => Promise<void>;
}

export function ShoppingListView({ items, recipeOptions, onAdd, onAddRecipes, onCheck, onDelete, onComplete }: ShoppingListViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const data = buildShoppingListResponse(items);
  const checked = items.filter((item) => item.checked);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null); setNotice(null); setBusy(true);
    try { await action(); if (success) setNotice(success); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update shopping list."); return false; }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-6">
    <p className="text-sm text-ink-mute">{data.total_visible} {data.total_visible === 1 ? "item" : "items"} · grouped by aisle</p>
    <div className="flex flex-wrap items-start gap-3"><ShoppingAddForm onAdd={(name, quantity) => run(() => onAdd(name, quantity))} />
      <button type="button" onClick={() => setModalOpen(true)} className="min-h-11 rounded-xl border border-line bg-paper-2 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra">+ Add from recipes</button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</p>}
    {data.groups.length === 0 ? <div className="rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute">Nothing to buy. Add an item or pull from your recipes.</div> :
      <div className="flex flex-col gap-8">{data.groups.map((group) => <AisleSection key={group.aisle} aisle={group.aisle} items={group.items}
        onCheck={(id, checkedValue) => void run(() => onCheck(id, checkedValue))}
        onDelete={(id) => void run(() => onDelete(id))} />)}</div>}
    <div className="flex flex-col justify-between gap-3 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:items-center">
      <p className="text-sm text-ink-mute">Checked items become pantry stock when you mark them bought. Items already in your pantry stay visible for review.</p>
      <div className="flex gap-2">{checked.length > 0 && <button type="button" disabled={busy} onClick={() => void run(() => onComplete(checked.map((item) => item.id)), `${checked.length} ${checked.length === 1 ? "item" : "items"} added to your pantry.`)} className="min-h-11 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink">Mark as bought</button>}
        {items.length > 0 && <button type="button" disabled={busy} onClick={() => void run(() => onComplete(items.map((item) => item.id)), `${items.length} ${items.length === 1 ? "item" : "items"} added to your pantry.`)} className="min-h-11 rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper">Complete shopping</button>}</div>
    </div>
    {modalOpen && <AddFromRecipesModal recipeOptions={recipeOptions} onClose={() => setModalOpen(false)} onGenerate={onAddRecipes} />}
  </div>;
}
