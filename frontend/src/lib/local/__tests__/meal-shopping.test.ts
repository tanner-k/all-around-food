import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeLocalDB, getLocalDB } from "../db";
import { addPlannedMeal, setPlannedServings, removePlannedMeal, generateWeekShopping, completeShopping, addShoppingItem, addRecipesToShopping, setShoppingChecked, addPantryItem, setPantryStatus, readSnapshot } from "../repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { normalizeName } from "@/lib/normalize";

const WEEK = "2026-09-21";
const OTHER_WEEK = "2026-09-28";

async function reset() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}

beforeEach(reset);
afterEach(reset);

async function seedRecipe() {
  const db = await getLocalDB();
  await db.put("recipes", { ...recipeFixture(), ingredients: [{
    name: "eggs", quantity: { value: 2, unit: null, as_written: "2 eggs" },
    preparation: null, optional: false, group: null, notes: null,
  }] });
}

describe("local weekly shopping", () => {
  it("retains repeated occurrences and scales the selected occurrence", async () => {
    await seedRecipe();
    await addPlannedMeal(WEEK, 0, "recipe-1");
    await addPlannedMeal(WEEK, 0, "recipe-1");
    await setPlannedServings(WEEK, 1, 2);
    await generateWeekShopping(WEEK);
    const snapshot = await readSnapshot();
    expect(snapshot.meal_plans[0].meals).toHaveLength(2);
    expect(snapshot.shopping[0].quantity_text).toBe("6");
    await removePlannedMeal(WEEK, 0);
    await generateWeekShopping(WEEK);
    expect((await readSnapshot()).shopping[0].quantity_text).toBe("4");
  });

  it("regenerates just one week, preserving manual rows and unchanged checks", async () => {
    await seedRecipe();
    await addPlannedMeal(WEEK, 0, "recipe-1");
    await addPlannedMeal(OTHER_WEEK, 0, "recipe-1");
    await generateWeekShopping(WEEK);
    await generateWeekShopping(OTHER_WEEK);
    const manual = await addShoppingItem("lemon", "1");
    const original = (await readSnapshot()).shopping.find((item) => item.generated_week_of === WEEK)!;
    await setShoppingChecked(original.id, true);
    await generateWeekShopping(WEEK);
    let items = (await readSnapshot()).shopping;
    expect(items.find((item) => item.id === original.id)?.checked).toBe(true);
    expect(items.find((item) => item.id === manual.id)).toBeDefined();
    expect(items.some((item) => item.generated_week_of === OTHER_WEEK)).toBe(true);
    await addPlannedMeal(WEEK, 1, "recipe-1");
    await generateWeekShopping(WEEK);
    items = (await readSnapshot()).shopping;
    expect(items.find((item) => item.generated_week_of === WEEK)).toMatchObject({ quantity_text: "4", checked: false });
    expect(items.find((item) => item.id === original.id)).toBeUndefined();
    expect(items.find((item) => item.id === manual.id)).toBeDefined();
    expect(items.some((item) => item.generated_week_of === OTHER_WEEK)).toBe(true);
  });

  it("persists review state and refreshes pantry coverage after an explicit status change", async () => {
    const db = await getLocalDB();
    await db.put("recipes", { ...recipeFixture(), servings: null, ingredients: [{
      name: "eggs", quantity: { value: 2, unit: null, as_written: "2 eggs" },
      preparation: null, optional: false, group: null, notes: null,
    }] });
    await addPlannedMeal(WEEK, 0, "recipe-1");
    await setPlannedServings(WEEK, 0, 2);
    const pantry = await addPantryItem("eggs");
    await generateWeekShopping(WEEK);
    let item = (await readSnapshot()).shopping[0];
    expect(item).toMatchObject({ needs_review: true, pantry_covered: true, pantry_low: false });
    await setPantryStatus(pantry.id, "low");
    item = (await readSnapshot()).shopping[0];
    expect(item).toMatchObject({ needs_review: true, pantry_covered: false, pantry_low: true });
    await setPantryStatus(pantry.id, "out");
    expect((await readSnapshot()).shopping[0]).toMatchObject({ pantry_covered: false, pantry_low: false });
  });

  it("replaces prior recipe-only rows without touching manual or planner rows", async () => {
    await seedRecipe();
    await addPlannedMeal(WEEK, 0, "recipe-1");
    await generateWeekShopping(WEEK);
    const manual = await addShoppingItem("lemon", "1");
    await addRecipesToShopping(["recipe-1"]);
    await addRecipesToShopping(["recipe-1"]);
    const items = (await readSnapshot()).shopping;
    expect(items.filter((item) => item.source === "recipe")).toHaveLength(1);
    expect(items.find((item) => item.id === manual.id)).toBeDefined();
    expect(items.filter((item) => item.source === "planner")).toHaveLength(1);
  });

  it("moves purchased rows into pantry once and keeps notes and aisle overrides", async () => {
    const db = await getLocalDB();
    const existing = { id: "pantry-eggs", name: "eggs", status: "low" as const,
      aisle: "Other" as const, aisle_overridden: true, notes: "farm stand",
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" };
    await db.put("pantry", existing);
    const eggs = await addShoppingItem("Eggs", "6");
    const milk = await addShoppingItem("milk", "1 L");
    await completeShopping([eggs.id, milk.id]);
    await completeShopping([eggs.id, milk.id]);
    const snapshot = await readSnapshot();
    expect(snapshot.shopping).toHaveLength(0);
    expect(snapshot.pantry).toHaveLength(2);
    expect(snapshot.pantry.find((item) => normalizeName(item.name) === "eggs")).toMatchObject({
      id: "pantry-eggs", status: "in_stock", aisle: "Other", aisle_overridden: true,
      notes: "farm stand", created_at: existing.created_at,
    });
  });
});
