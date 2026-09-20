import type { IDBPTransaction } from "idb";
import type { LocalDBSchema } from "./db";
import { MealPlanSchema, type MealPlan } from "@/lib/meal-plan-schema";
import { PantryItemSchema, type PantryItem, type PantryStatus } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { ShoppingListItemSchema, type ShoppingListItem } from "@/lib/shopping-schema";
import { aggregatePlannedIngredients, aggregateRecipeIngredients, categorize, recomputeAllFlags } from "@/lib/shopping-logic";
import { normalizeName } from "@/lib/normalize";
import { closeLocalDB, getLocalDB, reportStorageIssue } from "./db";
import {
  CookProgressSchema,
  RecipeDraftSchema,
  SettingSchema,
  type CookProgress,
  type LibrarySnapshot,
  type Setting,
} from "./schema";

const CHANGE_EVENT = "aaf-local-storage-change";
let channel: BroadcastChannel | undefined;

export function notifyChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    channel ??= new BroadcastChannel(CHANGE_EVENT);
    channel.postMessage("committed");
  }
}

/** Refresh a mounted view after commits, focus changes, or another tab commits. */
export function subscribeToLocalChanges(refresh: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => refresh();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("focus", onChange);
  if (typeof BroadcastChannel !== "undefined") {
    channel ??= new BroadcastChannel(CHANGE_EVENT);
    channel.addEventListener("message", onChange);
  }
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("focus", onChange);
    channel?.removeEventListener("message", onChange);
  };
}

export async function readSnapshot(): Promise<LibrarySnapshot> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(
      ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "settings"],
      "readonly",
    );
    const [recipes, mealPlans, shopping, pantry, cookProgress, drafts, settings] =
      await Promise.all([
        tx.objectStore("recipes").getAll(),
        tx.objectStore("meal_plans").getAll(),
        tx.objectStore("shopping").getAll(),
        tx.objectStore("pantry").getAll(),
        tx.objectStore("cook_progress").getAll(),
        tx.objectStore("drafts").getAll(),
        tx.objectStore("settings").getAll(),
      ]);
    await tx.done;
    return {
      recipes: RecipeSchema.array().parse(recipes),
      meal_plans: MealPlanSchema.array().parse(mealPlans),
      shopping: ShoppingListItemSchema.array().parse(shopping),
      pantry: PantryItemSchema.array().parse(pantry),
      cook_progress: CookProgressSchema.array().parse(cookProgress),
      drafts: RecipeDraftSchema.array().parse(drafts),
      settings: SettingSchema.array().parse(settings),
    };
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to read local storage.", error);
    throw error;
  }
}

export async function putRecipe(input: Recipe): Promise<void> {
  const recipe = RecipeSchema.parse(input);
  try {
    const db = await getLocalDB();
    const tx = db.transaction("recipes", "readwrite");
    await Promise.all([tx.store.put(recipe), tx.done]);
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to save recipe locally.", error);
    throw error;
  }
  notifyChange();
}

export async function saveMealPlan(input: MealPlan): Promise<void> {
  const plan = MealPlanSchema.parse(input);
  try {
    const db = await getLocalDB();
    const tx = db.transaction("meal_plans", "readwrite");
    await Promise.all([tx.store.put(plan), tx.done]);
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to save meal plan locally.", error);
    throw error;
  }
  notifyChange();
}

export async function saveCookProgress(input: CookProgress): Promise<void> {
  const progress = CookProgressSchema.parse(input);
  try {
    const db = await getLocalDB();
    const tx = db.transaction("cook_progress", "readwrite");
    const existing = await tx.store.get(progress.recipe_id);
    if (existing?.session_id && progress.session_id && existing.session_id !== progress.session_id) {
      await tx.done;
      return;
    }
    await tx.store.put({
      ...progress,
      session_id: existing?.session_id ?? progress.session_id,
      completed_at: existing?.completed_at ?? progress.completed_at,
    });
    await tx.done;
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to save cook progress locally.", error);
    throw error;
  }
  notifyChange();
}

/** Keep an unfinished session; start a fresh one after a completed cook. */
export async function beginCookSession(recipeId: string, forceNew = false): Promise<CookProgress> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("cook_progress", "readwrite");
    const existing = await tx.store.get(recipeId);
    const progress: CookProgress = existing && (!existing.completed_at || !forceNew)
      ? { ...existing, session_id: existing.session_id ?? crypto.randomUUID() }
      : { recipe_id: recipeId, step: 0, layout: "step", timer_end_at: null,
          paused_seconds: null, session_id: crypto.randomUUID(), completed_at: null };
    await tx.store.put(progress);
    await tx.done;
    notifyChange();
    return progress;
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to start cooking session.", error);
    throw error;
  }
}

/** The progress marker and cook count commit together, even across tabs. */
export async function completeCookSession(recipeId: string, sessionId: string): Promise<boolean> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["recipes", "cook_progress"], "readwrite");
    const progress = await tx.objectStore("cook_progress").get(recipeId);
    const recipe = await tx.objectStore("recipes").get(recipeId);
    if (!progress || !recipe || progress.session_id !== sessionId || progress.completed_at) {
      await tx.done;
      return false;
    }
    await tx.objectStore("cook_progress").put({ ...progress, completed_at: new Date().toISOString() });
    await tx.objectStore("recipes").put({ ...recipe, times_made: recipe.times_made + 1 });
    await tx.done;
    notifyChange();
    return true;
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to complete cooking session.", error);
    throw error;
  }
}

export async function saveSetting(input: Setting): Promise<void> {
  const setting = SettingSchema.parse(input);
  try {
    const db = await getLocalDB();
    const tx = db.transaction("settings", "readwrite");
    await Promise.all([tx.store.put(setting), tx.done]);
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to save local settings.", error);
    throw error;
  }
  notifyChange();
}

async function refreshShoppingFlags(tx: IDBPTransaction<LocalDBSchema, ("pantry" | "shopping")[], "readwrite">): Promise<void> {
  const pantry = await tx.objectStore("pantry").getAll() as PantryItem[];
  const shopping = await tx.objectStore("shopping").getAll() as ShoppingListItem[];
  for (const item of recomputeAllFlags(shopping, pantry)) await tx.objectStore("shopping").put(item);
}

function storageFailure(message: string, error: unknown): never {
  reportStorageIssue(message, error);
  throw error;
}

export async function addPlannedMeal(weekOf: string, dayIndex: number, recipeId: string): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("meal_plans", "readwrite");
    const previous = await tx.store.get(weekOf);
    const meals = [...(previous?.meals ?? []), { day_index: dayIndex, recipe_id: recipeId, servings: null }];
    await tx.store.put(MealPlanSchema.parse({ week_of: weekOf, meals, updated_at: new Date().toISOString() }));
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to update meal plan.", error); }
  notifyChange();
}

export async function removePlannedMeal(weekOf: string, index: number): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("meal_plans", "readwrite");
    const previous = await tx.store.get(weekOf);
    if (!previous?.meals[index]) { await tx.done; return; }
    const meals = previous.meals.filter((_, mealIndex) => mealIndex !== index);
    await tx.store.put(MealPlanSchema.parse({ ...previous, meals, updated_at: new Date().toISOString() }));
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to update meal plan.", error); }
  notifyChange();
}

export async function setPlannedServings(weekOf: string, index: number, servings: number | null): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("meal_plans", "readwrite");
    const previous = await tx.store.get(weekOf);
    if (!previous?.meals[index]) { await tx.done; return; }
    const meals = previous.meals.map((meal, mealIndex) => mealIndex === index ? { ...meal, servings } : meal);
    await tx.store.put(MealPlanSchema.parse({ ...previous, meals, updated_at: new Date().toISOString() }));
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to update meal servings.", error); }
  notifyChange();
}

export async function generateWeekShopping(weekOf: string): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["meal_plans", "recipes", "pantry", "shopping"], "readwrite");
    const [plan, recipes, pantry, existing] = await Promise.all([
      tx.objectStore("meal_plans").get(weekOf), tx.objectStore("recipes").getAll(),
      tx.objectStore("pantry").getAll(), tx.objectStore("shopping").getAll(),
    ]);
    const generated = aggregatePlannedIngredients(plan ?? { week_of: weekOf, meals: [], updated_at: new Date().toISOString() }, recipes, pantry);
    const prior = new Map(existing.filter(item => item.source === "planner" && item.generated_week_of === weekOf).map(item => [item.id, item]));
    for (const item of existing) {
      if (item.source === "planner" && item.generated_week_of === weekOf) await tx.objectStore("shopping").delete(item.id);
    }
    for (const item of generated) {
      const old = prior.get(item.id);
      await tx.objectStore("shopping").put(ShoppingListItemSchema.parse({ ...item, checked: old?.checked ?? false, created_at: old?.created_at ?? item.created_at }));
    }
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to generate weekly shopping list.", error); }
  notifyChange();
}

export async function addShoppingItem(name: string, quantityText = ""): Promise<ShoppingListItem> {
  const item = ShoppingListItemSchema.parse({ id: crypto.randomUUID(), name: name.trim(), quantity_text: quantityText.trim() || null,
    aisle: categorize(name), source: "manual", created_at: new Date().toISOString() });
  if (!item.name) throw new Error("Item name is required.");
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["shopping", "pantry"], "readwrite");
    const pantry = await tx.objectStore("pantry").getAll();
    const [flagged] = recomputeAllFlags([item], pantry);
    await tx.objectStore("shopping").put(flagged);
    await tx.done;
    notifyChange();
    return flagged;
  } catch (error) { await closeLocalDB(); return storageFailure("Unable to add shopping item.", error); }
}

export async function setShoppingChecked(id: string, checked: boolean): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("shopping", "readwrite");
    const item = await tx.store.get(id);
    if (item) await tx.store.put({ ...item, checked });
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to update shopping item.", error); }
  notifyChange();
}

export async function removeShoppingItem(id: string): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("shopping", "readwrite");
    await tx.store.delete(id);
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to remove shopping item.", error); }
  notifyChange();
}

export async function addPantryItem(name: string): Promise<PantryItem> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Pantry name is required.");
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["pantry", "shopping"], "readwrite");
    const existing = (await tx.objectStore("pantry").getAll()).find(item => normalizeName(item.name) === normalizeName(trimmed));
    const now = new Date().toISOString();
    const item = PantryItemSchema.parse(existing ? { ...existing, status: "in_stock", updated_at: now } : {
      id: crypto.randomUUID(), name: trimmed, status: "in_stock", aisle: categorize(trimmed),
      created_at: now, updated_at: now,
    });
    await tx.objectStore("pantry").put(item);
    await refreshShoppingFlags(tx);
    await tx.done;
    notifyChange();
    return item;
  } catch (error) { await closeLocalDB(); return storageFailure("Unable to add pantry item.", error); }
}

export async function removePantryItem(id: string): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["pantry", "shopping"], "readwrite");
    await tx.objectStore("pantry").delete(id);
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to remove pantry item.", error); }
  notifyChange();
}

export async function setPantryStatus(id: string, status: PantryStatus): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["pantry", "shopping"], "readwrite");
    const item = await tx.objectStore("pantry").get(id);
    if (!item) throw new Error("Pantry item was not found.");
    await tx.objectStore("pantry").put(PantryItemSchema.parse({ ...item, status, updated_at: new Date().toISOString() }));
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to update pantry status.", error); }
  notifyChange();
}

/** Move the selected purchased rows to pantry stock in one transaction. */
export async function completeShopping(itemIds: string[]): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["shopping", "pantry"], "readwrite");
    const pantry = await tx.objectStore("pantry").getAll();
    const byName = new Map(pantry.map(item => [normalizeName(item.name), item]));
    for (const id of new Set(itemIds)) {
      const item = await tx.objectStore("shopping").get(id);
      if (!item) continue;
      const now = new Date().toISOString();
      const key = normalizeName(item.name);
      const existing = byName.get(key);
      const stocked = PantryItemSchema.parse(existing ? { ...existing, status: "in_stock", updated_at: now } : {
        id: crypto.randomUUID(), name: item.name, status: "in_stock", aisle: item.aisle,
        created_at: now, updated_at: now,
      });
      await tx.objectStore("pantry").put(stocked);
      byName.set(key, stocked);
      await tx.objectStore("shopping").delete(id);
    }
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to complete shopping.", error); }
  notifyChange();
}

export async function addRecipesToShopping(recipeIds: string[]): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(["recipes", "pantry", "shopping"], "readwrite");
    const [recipes, pantry, existing] = await Promise.all([
      tx.objectStore("recipes").getAll(), tx.objectStore("pantry").getAll(), tx.objectStore("shopping").getAll(),
    ]);
    const selected = recipes.filter(recipe => recipeIds.includes(recipe.id));
    for (const item of existing) if (item.source === "recipe") await tx.objectStore("shopping").delete(item.id);
    for (const item of aggregateRecipeIngredients(selected, pantry)) await tx.objectStore("shopping").put(ShoppingListItemSchema.parse(item));
    await tx.done;
  } catch (error) { await closeLocalDB(); storageFailure("Unable to add recipes to shopping.", error); }
  notifyChange();
}
