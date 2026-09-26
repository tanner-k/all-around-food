import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MealPlan } from "@/lib/meal-plan-schema";
import type { PantryItem } from "@/lib/pantry-schema";
import type { Recipe } from "@/lib/recipe-schema";
import type { ShoppingListItem } from "@/lib/shopping-schema";
import type { CookProgress, LocalImport, RecipeDraft, Setting } from "./schema";
import type { SyncConflict, SyncMeta, SyncOutbox, SyncShadow } from "./sync-state";

const DB_VERSION = 2;
const OWNER_KEY = "aaf-verified-local-owner";
const SIGNED_OUT_KEY = "aaf-local-signed-out";
export type LocalAccount = Readonly<{ ownerId: string | null; dbName: string; generation: number }>;
export type LocalDBSchema = DBSchema & {
  recipes: { key: string; value: Recipe };
  meal_plans: { key: string; value: MealPlan };
  shopping: { key: string; value: ShoppingListItem };
  pantry: { key: string; value: PantryItem };
  cook_progress: { key: string; value: CookProgress };
  drafts: { key: string; value: RecipeDraft };
  imports: { key: string; value: LocalImport };
  settings: { key: string; value: Setting };
  sync_meta: { key: string; value: SyncMeta };
  sync_outbox: { key: string; value: SyncOutbox };
  sync_shadow: { key: string; value: SyncShadow };
  sync_conflicts: { key: string; value: SyncConflict };
};

function initialAccount(): LocalAccount {
  if (typeof window === "undefined") return { ownerId: null, dbName: "aaf-local", generation: 0 };
  if (window.localStorage.getItem(SIGNED_OUT_KEY) === "1") return { ownerId: null, dbName: "", generation: 0 };
  const ownerId = window.localStorage.getItem(OWNER_KEY);
  return ownerId ? { ownerId, dbName: `aaf-local:${ownerId}`, generation: 0 }
    : { ownerId: null, dbName: "aaf-local", generation: 0 };
}
let selected = initialAccount();
const connections = new Map<string, IDBPDatabase<LocalDBSchema>>();
const openings = new Map<string, Promise<IDBPDatabase<LocalDBSchema>>>();
const listeners = new Set<() => void>();
let openEpoch = 0;

export function captureLocalAccount(): LocalAccount { return selected; }
export function isCurrentLocalAccount(account: LocalAccount): boolean {
  return selected.generation === account.generation && selected.dbName === account.dbName &&
    selected.ownerId === account.ownerId && Boolean(account.dbName);
}
export function assertCurrentLocalAccount(account: LocalAccount): void {
  if (!isCurrentLocalAccount(account)) throw new Error("Local account changed; retry this action.");
}
function changeAccount(ownerId: string | null, dbName: string): void {
  selected = { ownerId, dbName, generation: selected.generation + 1 };
  for (const listener of listeners) listener();
}
export function selectVerifiedAccount(userId: string): void {
  if (!userId) throw new Error("Verified user ID is required.");
  if (typeof window !== "undefined") {
    window.localStorage.setItem(OWNER_KEY, userId);
    window.localStorage.removeItem(SIGNED_OUT_KEY);
  }
  if (selected.ownerId !== userId || !selected.dbName) changeAccount(userId, `aaf-local:${userId}`);
}
export function selectLegacyGuest(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(OWNER_KEY);
    window.localStorage.removeItem(SIGNED_OUT_KEY);
  }
  changeAccount(null, "aaf-local");
}
export function signOutLocalAccount(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(OWNER_KEY);
    window.localStorage.removeItem("aaf-import-owner-id");
    window.localStorage.setItem(SIGNED_OUT_KEY, "1");
  }
  changeAccount(null, "");
}
export function subscribeToLocalAccountChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== OWNER_KEY && event.key !== SIGNED_OUT_KEY) return;
    const next = initialAccount();
    if (selected.ownerId !== next.ownerId || selected.dbName !== next.dbName) {
      // Another tab changing identity invalidates this view; its auth check must verify the new user.
      changeAccount(null, "");
    }
  });
}

export function reportStorageIssue(message: string, error?: unknown): void {
  console.error(`[local storage] ${message}`, error);
  if (typeof window !== "undefined") window.dispatchEvent(
    new CustomEvent("aaf-local-storage-error", { detail: { message, error } }),
  );
}

export async function getLocalDB(account: LocalAccount = captureLocalAccount()): Promise<IDBPDatabase<LocalDBSchema>> {
  assertCurrentLocalAccount(account);
  const name = account.dbName;
  const cached = connections.get(name);
  if (cached) return cached;
  let opening = openings.get(name);
  if (!opening) {
    const epoch = openEpoch;
    opening = openDB<LocalDBSchema>(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("recipes", { keyPath: "id" });
          db.createObjectStore("meal_plans", { keyPath: "week_of" });
          db.createObjectStore("shopping", { keyPath: "id" });
          db.createObjectStore("pantry", { keyPath: "id" });
          db.createObjectStore("cook_progress", { keyPath: "recipe_id" });
          db.createObjectStore("drafts", { keyPath: "id" });
          db.createObjectStore("imports", { keyPath: "id" });
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("sync_meta", { keyPath: "key" });
          db.createObjectStore("sync_outbox", { keyPath: "mutation_id" });
          db.createObjectStore("sync_shadow", { keyPath: "key" });
          db.createObjectStore("sync_conflicts", { keyPath: "key" });
        }
      },
      blocked() { reportStorageIssue("Database upgrade is blocked by another tab."); },
      blocking() { connections.get(name)?.close(); connections.delete(name); openings.delete(name); },
      terminated() {
        connections.delete(name); openings.delete(name);
        reportStorageIssue("Database connection was unexpectedly terminated.");
      },
    }).then((db) => {
      openings.delete(name);
      if (epoch !== openEpoch || !isCurrentLocalAccount(account)) { db.close(); throw new Error("Local account changed; retry this action."); }
      connections.set(name, db);
      return db;
    }).catch((error: unknown) => {
      openings.delete(name);
      if (isCurrentLocalAccount(account)) reportStorageIssue("Unable to open local storage.", error);
      throw error;
    });
    openings.set(name, opening);
  }
  const db = await opening;
  assertCurrentLocalAccount(account);
  return db;
}

export async function closeLocalDB(): Promise<void> {
  openEpoch++;
  for (const db of connections.values()) db.close();
  connections.clear();
  openings.clear();
}
