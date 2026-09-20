import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IDBPObjectStore } from "idb";
import { closeLocalDB, getLocalDB, type LocalDBSchema } from "../db";
import {
  putRecipe,
  beginCookSession,
  completeCookSession,
  readSnapshot,
  saveCookProgress,
  saveMealPlan,
  subscribeToLocalChanges,
} from "../repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { PlannedMealSchema } from "@/lib/meal-plan-schema";
import { ShoppingListItemSchema } from "@/lib/shopping-schema";
import { SettingSchema } from "../schema";

async function deleteLocalDB(): Promise<void> {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion was blocked"));
  });
}

beforeEach(deleteLocalDB);
afterEach(deleteLocalDB);

describe("local repository", () => {
  it("defaults locally generated planner and shopping markers", () => {
    expect(
      PlannedMealSchema.parse({ day_index: 0, recipe_id: "recipe-1" }).servings,
    ).toBeNull();
    expect(
      ShoppingListItemSchema.parse({
        id: "shopping-1",
        name: "bread",
        created_at: "2026-09-20T12:00:00Z",
      }).generated_week_of,
    ).toBeNull();
  });

  it("retains a recipe after reopening the database", async () => {
    await putRecipe(recipeFixture());
    await closeLocalDB();
    expect((await readSnapshot()).recipes[0].title).toBe("Toast");
  });

  it("reopens after a cached database handle is closed", async () => {
    const db = await getLocalDB();
    db.close();

    await expect(putRecipe(recipeFixture())).rejects.toThrow();
    await putRecipe(recipeFixture());

    expect((await readSnapshot()).recipes[0].title).toBe("Toast");
  });

  it("stores validated planner and cook progress records", async () => {
    await saveMealPlan({
      week_of: "2026-09-21",
      meals: [{ day_index: 0, recipe_id: "recipe-1", servings: null }],
      updated_at: "2026-09-20T12:00:00Z",
    });
    await saveCookProgress({
      recipe_id: "recipe-1",
      step: 1,
      layout: "step",
      timer_end_at: null,
      paused_seconds: null,
    });

    const snapshot = await readSnapshot();
    expect(snapshot.meal_plans).toHaveLength(1);
    expect(snapshot.cook_progress).toEqual([
      expect.objectContaining({ recipe_id: "recipe-1", step: 1 }),
    ]);
  });

  it("counts a cooking session only once across repeated completion calls", async () => {
    await putRecipe(recipeFixture());
    const session = await beginCookSession("recipe-1");
    expect(await completeCookSession("recipe-1", session.session_id!)).toBe(true);
    expect(await completeCookSession("recipe-1", session.session_id!)).toBe(false);
    expect((await readSnapshot()).recipes[0].times_made).toBe(1);
    expect((await beginCookSession("recipe-1")).session_id).toBe(session.session_id);
    const next = await beginCookSession("recipe-1", true);
    expect(next.session_id).not.toBe(session.session_id);
    expect(await completeCookSession("recipe-1", next.session_id!)).toBe(true);
    expect((await readSnapshot()).recipes[0].times_made).toBe(2);
  });

  it("preserves a completed session and ignores an obsolete session's progress save", async () => {
    await putRecipe(recipeFixture());
    const first = await beginCookSession("recipe-1");
    const staleProgress = { ...first, step: 1, completed_at: null };

    expect(await completeCookSession("recipe-1", first.session_id!)).toBe(true);
    await saveCookProgress(staleProgress);

    expect((await readSnapshot()).cook_progress[0]).toEqual(
      expect.objectContaining({ session_id: first.session_id, completed_at: expect.any(String) }),
    );
    expect(await completeCookSession("recipe-1", first.session_id!)).toBe(false);
    expect((await readSnapshot()).recipes[0].times_made).toBe(1);

    const fresh = await beginCookSession("recipe-1", true);
    await saveCookProgress(staleProgress);

    expect((await readSnapshot()).cook_progress[0]).toEqual(
      expect.objectContaining({ session_id: fresh.session_id, step: 0, completed_at: null }),
    );
  });

  it("rejects a write when its database transaction cannot start", async () => {
    const db = await getLocalDB();
    db.close();

    await expect(putRecipe(recipeFixture())).rejects.toThrow();
  });

  it("emits a visible error when a write transaction fails", async () => {
    const db = await getLocalDB();
    db.close();
    const report = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("aaf-local-storage-error", report);

    await expect(putRecipe(recipeFixture())).rejects.toThrow();

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ message: expect.any(String) }) }),
    );
    window.removeEventListener("aaf-local-storage-error", report);
    consoleError.mockRestore();
  });

  it("emits a visible error when reading the snapshot fails", async () => {
    const db = await getLocalDB();
    db.close();
    const report = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("aaf-local-storage-error", report);

    await expect(readSnapshot()).rejects.toThrow();

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ message: expect.any(String) }) }),
    );
    window.removeEventListener("aaf-local-storage-error", report);
    consoleError.mockRestore();
  });

  it("emits a visible error when snapshot validation fails", async () => {
    const db = await getLocalDB();
    const tx = db.transaction("settings", "readwrite");
    await tx.store.put({ key: "last_backup_at", value: undefined } as never);
    await tx.done;
    const report = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("aaf-local-storage-error", report);

    await expect(readSnapshot()).rejects.toThrow();

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ message: expect.any(String) }) }),
    );
    window.removeEventListener("aaf-local-storage-error", report);
    consoleError.mockRestore();
  });

  it("rejects settings outside the non-secret setting key allowlist", () => {
    expect(() =>
      SettingSchema.parse({ key: "anthropic_api_key", value: "secret" }),
    ).toThrow();
    expect(
      SettingSchema.parse({ key: "last_backup_at", value: "2026-09-20T12:00:00Z" }),
    ).toEqual({ key: "last_backup_at", value: "2026-09-20T12:00:00Z" });
  });

  it("reports an aborted write transaction", async () => {
    const db = await getLocalDB();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((storeNames, mode, options) => {
      const tx = transaction(storeNames, mode, options);
      const store = tx.objectStore("recipes") as IDBPObjectStore<
        LocalDBSchema,
        ["recipes"],
        "recipes",
        "readwrite"
      >;
      const put = store.put.bind(store);
      vi.spyOn(store, "put").mockImplementation(async (...putArgs) => {
        const result = await put(...putArgs);
        void tx.done.catch(() => undefined);
        tx.abort();
        return result;
      });
      return tx;
    });
    const report = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("aaf-local-storage-error", report);

    await expect(putRecipe(recipeFixture())).rejects.toThrow();

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ message: expect.any(String) }) }),
    );
    window.removeEventListener("aaf-local-storage-error", report);
    consoleError.mockRestore();
  });

  it("closes older connections so an upgrade can finish", async () => {
    await getLocalDB();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("aaf-local", 2);
      request.onupgradeneeded = () => undefined;
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("upgrade was blocked"));
    });
  });

  it("refreshes subscribers after a commit, focus, and another-tab notification", async () => {
    const refresh = vi.fn();
    const unsubscribe = subscribeToLocalChanges(refresh);
    const otherTab = new BroadcastChannel("aaf-local-storage-change");

    await putRecipe(recipeFixture());
    window.dispatchEvent(new Event("focus"));
    otherTab.postMessage("committed");

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    otherTab.close();
    unsubscribe();
  });
});
