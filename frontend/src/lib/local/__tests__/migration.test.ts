import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { closeLocalDB } from "../db";
import { readSnapshot } from "../repository";
import { migrateSupabaseLibrary } from "../migrate";

async function reset() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
beforeEach(reset);
afterEach(() => { vi.unstubAllGlobals(); return reset(); });

describe("cloud migration", () => {
  it("merges idempotently and preserves later local edits", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const response = { format: "all-around-food", version: 1, exported_at: "2026-09-20T12:00:00Z", library: { recipes: [recipeFixture()], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    expect((await migrateSupabaseLibrary()).stores.recipes.inserted).toBe(1);
    const db = await (await import("../db")).getLocalDB();
    await db.put("recipes", { ...recipeFixture(), title: "Local edit" });
    expect((await migrateSupabaseLibrary()).stores.recipes.skipped).toBe(1);
    expect((await readSnapshot()).recipes[0].title).toBe("Local edit");
  });
});
