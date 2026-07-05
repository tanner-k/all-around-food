"use client";

import { useState } from "react";
import {
  addManualItemAction,
  clearCheckedAction,
  completeShoppingAction,
  getShoppingListAction,
  removeItemAction,
  toggleCheckedAction,
} from "@/app/(app)/shop/actions";
import type { ShoppingCompletionResult } from "@/lib/db/shopping";
import type { ShoppingListResponse } from "@/lib/shopping-schema";
import { AisleSection } from "./AisleSection";
import { ShoppingAddForm } from "./ShoppingAddForm";
import { AddFromRecipesModal, type RecipeOption } from "./AddFromRecipesModal";
import { TextListModal } from "./TextListModal";

interface ShoppingListViewProps {
  initial: ShoppingListResponse;
  recipeOptions: RecipeOption[];
}

export function ShoppingListView({
  initial,
  recipeOptions,
}: ShoppingListViewProps) {
  const [data, setData] = useState<ShoppingListResponse>(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasChecked = data.groups.some((g) =>
    g.items.some((i) => i.checked)
  );
  const hasItems = data.groups.length > 0;

  function describeResult(result: ShoppingCompletionResult): string {
    const n = result.pantry_added + result.pantry_updated;
    return `${n} ${n === 1 ? "item" : "items"} added to your pantry.`;
  }

  async function refresh() {
    const result = await getShoppingListAction();
    if (result.ok) {
      setData(result.data);
    } else {
      setError(result.error);
    }
  }

  async function handleAdd(name: string, quantityText: string) {
    setError(null);
    const result = await addManualItemAction(name, quantityText || undefined);
    if (result.ok) {
      await refresh();
    } else {
      setError(result.error);
    }
  }

  async function handleCheck(id: string, checked: boolean) {
    setError(null);
    const previous = data;
    setData((cur) => ({
      ...cur,
      groups: cur.groups.map((g) => ({
        ...g,
        items: g.items.map((i) =>
          i.id === id ? { ...i, checked } : i
        ),
      })),
    }));
    const result = await toggleCheckedAction(id, checked);
    if (!result.ok) {
      setData(previous);
      setError(result.error);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const previous = data;
    setData((cur) => {
      const groups = cur.groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.id !== id) }))
        .filter((g) => g.items.length > 0);
      return {
        ...cur,
        groups,
        total_visible: groups.reduce((n, g) => n + g.items.length, 0),
      };
    });
    const result = await removeItemAction(id);
    if (!result.ok) {
      setData(previous);
      setError(result.error);
    }
  }

  async function handleMarkBought() {
    setError(null);
    setNotice(null);
    const result = await clearCheckedAction();
    if (result.ok) {
      setNotice(describeResult(result.data));
      await refresh();
    } else {
      setError(result.error);
    }
  }

  async function handleComplete() {
    setError(null);
    setNotice(null);
    const result = await completeShoppingAction();
    if (result.ok) {
      setNotice(describeResult(result.data));
      await refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-mute">
        {data.total_visible} {data.total_visible === 1 ? "item" : "items"} ·
        grouped by aisle
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-start gap-3">
        <ShoppingAddForm onAdd={handleAdd} />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-xl border border-line bg-paper-2 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra"
        >
          + Add from recipes
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {notice && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}

      {/* List */}
      {data.groups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute">
          Nothing to buy. Add an item or pull from your recipes.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {data.groups.map((group) => (
            <AisleSection
              key={group.aisle}
              aisle={group.aisle}
              items={group.items}
              onCheck={handleCheck}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-ink-mute">
          Checked items become pantry stock when you mark them bought.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {hasChecked && (
            <button
              type="button"
              onClick={handleMarkBought}
              className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 min-h-10"
            >
              Mark as bought
            </button>
          )}
          {hasItems && (
            <button
              type="button"
              onClick={handleComplete}
              className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] min-h-11"
            >
              Complete shopping
            </button>
          )}
          {hasItems && (
            <button
              type="button"
              onClick={() => setTextModalOpen(true)}
              className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-terra hover:text-terra min-h-10"
            >
              Text list
            </button>
          )}
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper opacity-40 min-h-10"
          >
            Send to Kroger
          </button>
        </div>
      </div>

      {modalOpen && (
        <AddFromRecipesModal
          recipeOptions={recipeOptions}
          onClose={() => setModalOpen(false)}
          onGenerated={refresh}
        />
      )}

      {textModalOpen && (
        <TextListModal onClose={() => setTextModalOpen(false)} />
      )}
    </div>
  );
}
