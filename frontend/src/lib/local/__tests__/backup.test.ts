import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { closeLocalDB, getLocalDB, type LocalDBSchema } from "../db";
import { exportBackup, restoreBackup } from "../backup";
import { readSnapshot } from "../repository";

async function reset() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(reset);
afterEach(reset);

async function seed() {
  const db = await getLocalDB();
  const tx = db.transaction(["recipes", "meal_plans", "pantry", "shopping", "drafts", "cook_progress", "settings"], "readwrite");
  await tx.objectStore("recipes").put(recipeFixture());
  await tx.objectStore("meal_plans").put({ week_of: "2026-09-21", meals: [{ day_index: 0, recipe_id: "recipe-1", servings: null }], updated_at: "2026-09-20T12:00:00Z" });
  await tx.objectStore("pantry").put({ id: "pantry-1", name: "bread", status: "in_stock", aisle: "Bakery", aisle_overridden: false, notes: null, created_at: "2026-09-20T12:00:00Z", updated_at: "2026-09-20T12:00:00Z" });
  await tx.objectStore("shopping").put({ id: "shop-1", name: "bread", quantity_text: null, aisle: "Bakery", checked: false, source: "recipe", source_recipe_id: "recipe-1", generated_week_of: "2026-09-21", pantry_covered: false, pantry_low: false, needs_review: false, created_at: "2026-09-20T12:00:00Z" });
  await tx.objectStore("drafts").put({ id: "draft-1", recipe: recipeFixture(), warnings: [], received_at: "2026-09-20T12:00:00Z" });
  await tx.objectStore("cook_progress").put({ recipe_id: "recipe-1", step: 1, layout: "step", timer_end_at: null, paused_seconds: null });
  await tx.objectStore("settings").put({ key: "last_migration", value: "2026-09-20T12:00:00Z" });
  await tx.done;
}

describe("backup and restore", () => {
  it("round-trips every durable store and omits pending imports", async () => {
    await seed();
    const original = await readSnapshot();
    const backup = await exportBackup();
    expect(JSON.parse(backup)).toMatchObject({ format: "all-around-food", version: 1, library: original });
    await reset();
    const report = await restoreBackup(backup, "merge");
    expect(report.validation_errors).toEqual([]);
    expect(await readSnapshot()).toEqual(original);
  });

  it("rejects an orphan reference and duplicate ID before any write", async () => {
    await seed();
    const backup = JSON.parse(await exportBackup());
    backup.library.meal_plans[0].meals[0].recipe_id = "missing";
    backup.library.recipes.push(backup.library.recipes[0]);
    const before = await readSnapshot();
    const report = await restoreBackup(JSON.stringify(backup), "merge");
    expect(report.validation_errors.join(" ")).toMatch(/duplicate/i);
    expect(report.validation_errors.join(" ")).toMatch(/missing/i);
    expect(await readSnapshot()).toEqual(before);
  });

  it("rejects future versions and malformed records before any write", async () => {
    await seed();
    const backup = JSON.parse(await exportBackup());
    backup.version = 2;
    expect((await restoreBackup(JSON.stringify(backup), "merge")).validation_errors).toHaveLength(1);
    backup.version = 1;
    backup.library.recipes[0].title = 123;
    expect((await restoreBackup(JSON.stringify(backup), "merge")).validation_errors).toHaveLength(1);
    expect((await readSnapshot()).recipes[0].title).toBe("Toast");
  });

  it("preserves local edits on merge and requires prebackup and confirmation for replace", async () => {
    await seed();
    const backup = await exportBackup();
    const db = await getLocalDB();
    const edited = { ...recipeFixture(), title: "My edited toast" };
    await db.put("recipes", edited);
    const report = await restoreBackup(backup, "merge");
    expect(report.stores.recipes).toEqual({ inserted: 0, skipped: 1 });
    expect((await readSnapshot()).recipes[0].title).toBe("My edited toast");
    expect((await restoreBackup(backup, "replace")).validation_errors).toHaveLength(1);
    const preRestoreBackup = await exportBackup();
    const replaced = await restoreBackup(backup, "replace", { confirmed: true, preRestoreBackup });
    expect(replaced.validation_errors).toEqual([]);
    expect((await readSnapshot()).recipes[0].title).toBe("Toast");
  });

  it("rejects a second-tab edit queued between the old snapshot read and replacement transaction", async () => {
    await seed();
    const preRestoreBackup = await exportBackup();
    const replacement = JSON.parse(preRestoreBackup);
    replacement.library.recipes[0].title = "Replacement toast";
    const db = await getLocalDB();
    const secondTab = await openDB<LocalDBSchema>("aaf-local");
    const transaction = db.transaction.bind(db);
    let concurrentWrite: Promise<unknown> | undefined;
    vi.spyOn(db, "transaction").mockImplementation((names, mode, options) => {
      if (mode === "readwrite" && !concurrentWrite) {
        concurrentWrite = secondTab.put("recipes", { ...recipeFixture(), title: "Second-tab edit" });
      }
      return transaction(names, mode, options);
    });
    try {
      const report = await restoreBackup(JSON.stringify(replacement), "replace", { confirmed: true, preRestoreBackup });
      await concurrentWrite;
      expect(report.validation_errors).toMatchObject([expect.stringMatching(/changed after the pre-restore backup/i)]);
      expect((await readSnapshot()).recipes[0].title).toBe("Second-tab edit");
    } finally {
      vi.restoreAllMocks();
      secondTab.close();
    }
  });

  it("rolls back earlier store writes when a later operation fails", async () => {
    await seed();
    const preRestoreBackup = await exportBackup();
    const original = await readSnapshot();
    const replacement = JSON.parse(preRestoreBackup);
    replacement.library.recipes[0].title = "Replacement toast";
    replacement.library.shopping = [];
    replacement.library.pantry[0].name = "Replacement bread";
    const db = await getLocalDB();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((names, mode, options) => {
      const tx = transaction(names, mode, options);
      void tx.done.catch(() => undefined);
      if (mode === "readwrite") {
        const objectStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, "objectStore").mockImplementation((name) => {
          const store = objectStore(name);
          if (name === "pantry") {
            const writable = store as unknown as { add: (item: unknown) => Promise<unknown>; put: (item: unknown) => Promise<unknown> };
            vi.spyOn(writable, "put").mockImplementationOnce(async (item) => {
              await writable.add(item);
              return writable.add(item); // A real duplicate-key request aborts the transaction.
            });
          }
          return store;
        });
      }
      return tx;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(restoreBackup(JSON.stringify(replacement), "replace", { confirmed: true, preRestoreBackup })).rejects.toThrow();
    vi.restoreAllMocks();
    consoleError.mockRestore();
    expect(await readSnapshot()).toEqual(original);
  });
});
