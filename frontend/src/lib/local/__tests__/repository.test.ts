import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeLocalDB, getLocalDB } from "../db";
import {
  putRecipe,
  readSnapshot,
  saveCookProgress,
  saveMealPlan,
  subscribeToLocalChanges,
} from "../repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { PlannedMealSchema } from "@/lib/meal-plan-schema";
import { ShoppingListItemSchema } from "@/lib/shopping-schema";

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
