import type { IDBPTransaction } from "idb";
import type { LocalDBSchema } from "./db";

export type SyncKind = "recipe" | "draft" | "planned_meal" | "shopping" | "pantry" | "cook_session";
export type SyncChange = {
  kind: SyncKind; entity_id: string; base_revision: number | null; payload: unknown | null; deleted: boolean;
};
export type LocalSyncChange = Omit<SyncChange, "base_revision">;
export type SyncOutbox = {
  mutation_id: string; sequence: number; changes: SyncChange[]; depends_on: string[];
  status: "pending" | "frozen" | "conflict"; created_at: string;
};
export type SyncMeta = { key: "pull_cursor" | "lease" | "last_success_at"; value: unknown };
export type SyncShadow = { key: string; revision: number; payload: unknown | null; deleted: boolean };
export type SyncConflict = { key: string; local: unknown | null; remote: unknown | null; created_at: string };
export const syncEntityKey = (kind: SyncKind, entityId: string): string => `${kind}:${entityId}`;

type SyncStores = "recipes" | "drafts" | "imports" | "sync_outbox" | "sync_shadow";
type SyncTx = IDBPTransaction<LocalDBSchema, SyncStores[], "readwrite">;

/** Called inside the entity write transaction. The runner resolves each dependency from its accepted predecessor before freezing. */
export async function enqueueSyncGroup(tx: SyncTx, changes: LocalSyncChange[]): Promise<SyncOutbox> {
  try {
  if (!changes.length || changes.length > 100) throw new Error("A sync group must contain 1 to 100 changes.");
  if (new TextEncoder().encode(JSON.stringify(changes)).length > 1024 * 1024)
    throw new Error("A sync group exceeds 1 MiB.");
  const pending = await tx.objectStore("sync_outbox").getAll();
  const dependencies = new Set<string>();
  const prepared: SyncChange[] = [];
  for (const change of changes) {
    const prior = pending.filter((row) => row.changes.some(
      (item) => item.kind === change.kind && item.entity_id === change.entity_id,
    )).sort((a, b) => b.sequence - a.sequence)[0];
    if (prior) dependencies.add(prior.mutation_id);
    const shadow = await tx.objectStore("sync_shadow").get(syncEntityKey(change.kind, change.entity_id));
    prepared.push({ ...change, base_revision: shadow?.revision ?? null });
  }
  const group: SyncOutbox = {
    mutation_id: crypto.randomUUID(), sequence: Math.max(0, ...pending.map((row) => row.sequence)) + 1,
    changes: prepared, depends_on: [...dependencies],
    status: "pending", created_at: new Date().toISOString(),
  };
  await tx.objectStore("sync_outbox").add(group);
  return group;
  } catch (error) {
    void tx.done.catch(() => undefined);
    try { tx.abort(); } catch { /* Transaction already ended. */ }
    throw error;
  }
}
