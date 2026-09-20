import { MealPlanSchema, type MealPlan } from "@/lib/meal-plan-schema";
import { PantryItemSchema } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { ShoppingListItemSchema } from "@/lib/shopping-schema";
import { closeLocalDB, getLocalDB, reportStorageIssue } from "./db";
import {
  CookProgressSchema,
  RecipeDraftSchema,
  SettingSchema,
  type CookProgress,
  type LibrarySnapshot,
} from "./schema";

const CHANGE_EVENT = "aaf-local-storage-change";
let channel: BroadcastChannel | undefined;

function notifyChange(): void {
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
    await Promise.all([tx.store.put(progress), tx.done]);
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to save cook progress locally.", error);
    throw error;
  }
  notifyChange();
}
