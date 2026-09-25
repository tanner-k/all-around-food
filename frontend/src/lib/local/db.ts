import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MealPlan } from "@/lib/meal-plan-schema";
import type { PantryItem } from "@/lib/pantry-schema";
import type { Recipe } from "@/lib/recipe-schema";
import type { ShoppingListItem } from "@/lib/shopping-schema";
import type { CookProgress, LocalImport, RecipeDraft, Setting } from "./schema";

const DB_NAME = "aaf-local";
const DB_VERSION = 1;

export type LocalDBSchema = DBSchema & {
  recipes: { key: string; value: Recipe };
  meal_plans: { key: string; value: MealPlan };
  shopping: { key: string; value: ShoppingListItem };
  pantry: { key: string; value: PantryItem };
  cook_progress: { key: string; value: CookProgress };
  drafts: { key: string; value: RecipeDraft };
  imports: { key: string; value: LocalImport };
  settings: { key: string; value: Setting };
};

let database: IDBPDatabase<LocalDBSchema> | undefined;
let opening: Promise<IDBPDatabase<LocalDBSchema>> | undefined;

export function reportStorageIssue(message: string, error?: unknown): void {
  console.error(`[local storage] ${message}`, error);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("aaf-local-storage-error", { detail: { message, error } }),
    );
  }
}

export async function getLocalDB(): Promise<IDBPDatabase<LocalDBSchema>> {
  if (database) return database;
  if (!opening) {
    opening = openDB<LocalDBSchema>(DB_NAME, DB_VERSION, {
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
      },
      blocked() {
        reportStorageIssue("Database upgrade is blocked by another tab.");
      },
      blocking() {
        database?.close();
        database = undefined;
        opening = undefined;
      },
      terminated() {
        database = undefined;
        opening = undefined;
        reportStorageIssue("Database connection was unexpectedly terminated.");
      },
    })
      .then((db) => {
        database = db;
        opening = undefined;
        return db;
      })
      .catch((error: unknown) => {
        opening = undefined;
        reportStorageIssue("Unable to open local storage.", error);
        throw error;
      });
  }
  return opening;
}

export async function closeLocalDB(): Promise<void> {
  database?.close();
  database = undefined;
  opening = undefined;
}
