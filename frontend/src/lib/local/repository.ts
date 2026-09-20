import { MealPlanSchema, type MealPlan } from "@/lib/meal-plan-schema";
import { PantryItemSchema, type PantryStatus } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { ShoppingListItemSchema } from "@/lib/shopping-schema";
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

export async function setPantryStatus(id: string, status: PantryStatus): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction("pantry", "readwrite");
    const item = await tx.store.get(id);
    if (!item) throw new Error("Pantry item was not found.");
    await tx.store.put(PantryItemSchema.parse({ ...item, status }));
    await tx.done;
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to update pantry status.", error);
    throw error;
  }
  notifyChange();
}
