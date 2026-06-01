"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, type ShoppingItem } from "@/lib/api";
import Link from "next/link";

export function ShopView() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.shop.list();
      setItems(data);
    } catch {
      setError("Could not load shopping list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: state is updated after the awaited fetch resolves, a
    // legitimate external-sync use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleToggle(item: ShoppingItem) {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
    );
    try {
      const updated = await api.shop.update(item.id, { checked: !item.checked });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)),
      );
    }
  }

  async function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.shop.remove(id);
    } catch {
      // reload to restore
      await load();
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const item = await api.shop.create({ name });
      setItems((prev) => [...prev, item]);
      setNewName("");
    } catch {
      // silently ignore
    } finally {
      setAdding(false);
    }
  }

  async function handleClearChecked() {
    const checked = items.filter((i) => i.checked);
    setItems((prev) => prev.filter((i) => !i.checked));
    try {
      await Promise.all(checked.map((i) => api.shop.remove(i.id)));
    } catch {
      await load();
    }
  }

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const total = items.length;
  const doneCount = checked.length;

  return (
    <>
      <SectionHeader
        number="03"
        scene="SHOPPING"
        title={
          <>
            Shopping <em className="italic text-terra">list</em>.
          </>
        }
        description="Grouped and ready to go. Check items off as you shop."
      />

      <div className="mt-14 space-y-6">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-ink-mute">
              {loading
                ? "Loading…"
                : total === 0
                  ? "List is empty"
                  : `${total} item${total !== 1 ? "s" : ""} · ${doneCount} checked off`}
            </p>
          </div>
          {doneCount > 0 && (
            <Button size="sm" variant="ghost" onClick={handleClearChecked}>
              Clear checked ({doneCount})
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-terra-soft border border-terra/20 px-4 py-3 text-sm text-terra">
            {error}
          </div>
        )}

        {/* Add item form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Add an item…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={adding}
            className="flex-1"
          />
          <Button type="submit" variant="terra" size="md" disabled={!newName.trim() || adding}>
            {adding ? "…" : "Add"}
          </Button>
        </form>

        {loading && (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-line" />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="🛒"
            title="List is empty"
            description="Add items above, or add recipe ingredients from the Cookbook."
            action={
              <Link
                href="/cookbook"
                className="inline-flex items-center gap-1.5 rounded-full bg-terra-soft px-4 py-2 text-xs font-semibold text-terra hover:bg-terra hover:text-paper transition-colors"
              >
                Browse cookbook
              </Link>
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="rounded-xl border border-line bg-paper overflow-hidden">
            {/* Unchecked items */}
            {unchecked.length > 0 && (
              <div>
                <div className="px-4 py-2 border-b border-line bg-paper-2">
                  <p className="font-serif italic text-sm text-ink-soft">
                    To get{" "}
                    <span className="float-right font-sans not-italic text-[10px] text-ink-mute">
                      {unchecked.length}
                    </span>
                  </p>
                </div>
                <ul>
                  {unchecked.map((item) => (
                    <ShopRow
                      key={item.id}
                      item={item}
                      onToggle={handleToggle}
                      onRemove={handleRemove}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Checked items */}
            {checked.length > 0 && (
              <div className={unchecked.length > 0 ? "border-t border-line" : ""}>
                <div className="px-4 py-2 border-b border-line bg-paper-2">
                  <p className="font-serif italic text-sm text-ink-mute">
                    Got it{" "}
                    <span className="float-right font-sans not-italic text-[10px] text-ink-mute">
                      {checked.length}
                    </span>
                  </p>
                </div>
                <ul>
                  {checked.map((item) => (
                    <ShopRow
                      key={item.id}
                      item={item}
                      onToggle={handleToggle}
                      onRemove={handleRemove}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* CTA: add recipe ingredients */}
        {!loading && (
          <div className="rounded-xl border border-dashed border-line-strong bg-paper-2 px-6 py-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Add from a recipe</p>
              <p className="text-xs text-ink-mute">
                Open a recipe in the Cookbook and tap &ldquo;Add ingredients to shop&rdquo;.
              </p>
            </div>
            <Link
              href="/cookbook"
              className="inline-flex items-center gap-1.5 rounded-full bg-terra text-paper px-4 py-2 text-xs font-semibold hover:bg-terra/90 transition-colors shrink-0"
            >
              Browse cookbook →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

// ── Single shopping row ────────────────────────────────────────────────────

interface ShopRowProps {
  item: ShoppingItem;
  onToggle: (item: ShoppingItem) => void;
  onRemove: (id: string) => void;
}

function ShopRow({ item, onToggle, onRemove }: ShopRowProps) {
  return (
    <li
      className={[
        "group flex items-center gap-2.5 px-4 py-2.5 border-b border-dashed border-line last:border-b-0 text-sm",
        item.checked ? "text-ink-mute" : "text-ink",
      ].join(" ")}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        aria-label={item.checked ? "Uncheck" : "Check"}
        className={[
          "w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors",
          item.checked
            ? "bg-ink border-ink text-paper"
            : "border-ink hover:border-terra",
        ].join(" ")}
      >
        {item.checked && <span className="text-[9px] leading-none">✓</span>}
      </button>

      {/* Name */}
      <span
        className={[
          "flex-1 min-w-0 truncate",
          item.checked ? "line-through" : "",
        ].join(" ")}
      >
        {item.name}
      </span>

      {/* Amount / unit */}
      {item.amount !== null && (
        <span className="text-[11px] text-ink-mute flex-shrink-0">
          {item.amount}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
      )}

      {/* Recipe badge */}
      {item.recipeId && (
        <span className="text-[10px] text-terra flex-shrink-0">from recipe</span>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id)}
        aria-label="Remove item"
        className="hidden group-hover:inline text-ink-mute hover:text-terra transition-colors text-sm leading-none ml-1 flex-shrink-0"
      >
        ×
      </button>
    </li>
  );
}
