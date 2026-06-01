"use client";

import { useEffect, useState, useCallback } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { api, type PantryItem } from "@/lib/api";

interface EditState {
  item: PantryItem;
  name: string;
  amount: string;
  unit: string;
}

export function PantryView() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add form
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit dialog
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.pantry.list();
      setItems(data);
    } catch {
      setError("Could not load pantry. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const amt = parseFloat(addAmount);
      const item = await api.pantry.create({
        name,
        ...(addAmount && !isNaN(amt) ? { amount: amt } : {}),
        ...(addUnit.trim() ? { unit: addUnit.trim() } : {}),
      });
      setItems((prev) => [item, ...prev]);
      setAddName("");
      setAddAmount("");
      setAddUnit("");
    } catch {
      // silently ignore
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit() {
    if (!editState) return;
    setSaving(true);
    try {
      const amt = parseFloat(editState.amount);
      const updated = await api.pantry.update(editState.item.id, {
        name: editState.name.trim() || editState.item.name,
        ...(editState.amount && !isNaN(amt) ? { amount: amt } : {}),
        ...(editState.unit.trim() ? { unit: editState.unit.trim() } : {}),
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditState(null);
    } catch {
      // keep dialog open; user can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.pantry.remove(id);
    } catch {
      await load();
    }
  }

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <SectionHeader
        number="04"
        scene="YOUR KITCHEN"
        title={
          <>
            What&apos;s <em className="italic text-terra">on hand</em>.
          </>
        }
        description="Track what's in your pantry. Low-stock alerts before you run out."
      />

      <div className="mt-14 space-y-6">
        {/* Add item form */}
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-line bg-paper p-5 space-y-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
            Add to pantry
          </p>
          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex-1 min-w-[160px]">
              <Input
                placeholder="Ingredient name…"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="w-24">
              <Input
                type="number"
                placeholder="Amount"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                min={0}
                step="any"
                disabled={adding}
              />
            </div>
            <div className="w-24">
              <Input
                placeholder="Unit"
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                disabled={adding}
              />
            </div>
            <Button
              type="submit"
              variant="terra"
              size="md"
              disabled={!addName.trim() || adding}
            >
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>

        {/* Search + count */}
        <div className="flex items-center gap-4 flex-wrap">
          <input
            type="search"
            placeholder="Search pantry…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm rounded-full border border-line bg-paper px-4 py-1.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink-soft transition-colors"
          />
          {!loading && items.length > 0 && (
            <span className="text-xs text-ink-mute ml-auto">
              {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-terra-soft border border-terra/20 px-4 py-3 text-sm text-terra">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-line" />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="🥫"
            title="Pantry is empty"
            description="Add ingredients above to track what's on hand."
          />
        )}

        {!loading && !error && items.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon="🔍"
            title="No matches"
            description={`Nothing in pantry matching "${search}".`}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="rounded-xl border border-line bg-paper overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
                    Ingredient
                  </th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
                    Amount
                  </th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-mute hidden sm:table-cell">
                    Updated
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="group border-b border-dashed border-line last:border-b-0 hover:bg-paper-2 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">{item.name}</td>
                    <td className="px-4 py-2.5 text-ink-mute">
                      {item.amount !== null ? (
                        <span>
                          {item.amount}
                          {item.unit ? ` ${item.unit}` : ""}
                        </span>
                      ) : (
                        <span className="text-ink-mute italic text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-mute text-xs hidden sm:table-cell">
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditState({
                              item,
                              name: item.name,
                              amount: item.amount?.toString() ?? "",
                              unit: item.unit ?? "",
                            })
                          }
                          className="text-xs text-ink-mute hover:text-ink transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="text-xs text-ink-mute hover:text-terra transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog
        open={editState !== null}
        onClose={() => setEditState(null)}
        title="Edit pantry item"
      >
        {editState && (
          <div className="space-y-4">
            <Input
              label="Name"
              value={editState.name}
              onChange={(e) => setEditState((s) => s ? { ...s, name: e.target.value } : s)}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Amount"
                  type="number"
                  min={0}
                  step="any"
                  value={editState.amount}
                  onChange={(e) => setEditState((s) => s ? { ...s, amount: e.target.value } : s)}
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Unit"
                  value={editState.unit}
                  onChange={(e) => setEditState((s) => s ? { ...s, unit: e.target.value } : s)}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="terra"
                size="lg"
                block
                disabled={saving || !editState.name.trim()}
                onClick={handleSaveEdit}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button size="lg" onClick={() => setEditState(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
