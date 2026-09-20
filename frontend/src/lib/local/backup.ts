import { z } from "zod";
import { MealPlanSchema } from "@/lib/meal-plan-schema";
import { PantryItemSchema } from "@/lib/pantry-schema";
import { RecipeSchema } from "@/lib/recipe-schema";
import { ShoppingListItemSchema } from "@/lib/shopping-schema";
import { closeLocalDB, getLocalDB, reportStorageIssue } from "./db";
import { notifyChange, readSnapshot } from "./repository";
import { CookProgressSchema, RecipeDraftSchema, SettingSchema, type LibrarySnapshot } from "./schema";

const storeNames = ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "settings"] as const;
export type StoreName = (typeof storeNames)[number];
export type MigrationReport = {
  stores: Record<StoreName, { inserted: number; skipped: number }>;
  validation_errors: string[];
};
export type BackupEnvelope = {
  format: "all-around-food";
  version: 1;
  exported_at: string;
  library: LibrarySnapshot;
};

const LibrarySchema = z.object({
  recipes: z.array(RecipeSchema),
  meal_plans: z.array(MealPlanSchema),
  shopping: z.array(ShoppingListItemSchema),
  pantry: z.array(PantryItemSchema),
  cook_progress: z.array(CookProgressSchema),
  drafts: z.array(RecipeDraftSchema),
  settings: z.array(SettingSchema),
});
const EnvelopeSchema = z.object({
  format: z.literal("all-around-food"),
  version: z.literal(1),
  exported_at: z.string().datetime(),
  library: LibrarySchema,
});

export function emptyReport(): MigrationReport {
  return {
    stores: Object.fromEntries(storeNames.map((name) => [name, { inserted: 0, skipped: 0 }])) as MigrationReport["stores"],
    validation_errors: [],
  };
}

const keys: { [K in StoreName]: keyof LibrarySnapshot[K][number] } = {
  recipes: "id",
  meal_plans: "week_of",
  shopping: "id",
  pantry: "id",
  cook_progress: "recipe_id",
  drafts: "id",
  settings: "key",
};

/** Validate the entire file, including relationships, before opening a write transaction. */
export function parseBackup(json: string): { backup?: BackupEnvelope; errors: string[] } {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return { errors: ["Backup is not valid JSON."] };
  }
  const parsed = EnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  const library = parsed.data.library;
  const errors: string[] = [];
  for (const name of storeNames) {
    const seen = new Set<string>();
    for (const item of library[name]) {
      const id = String(item[keys[name] as keyof typeof item]);
      if (!id.trim()) errors.push(`${name}: empty ID`);
      if (seen.has(id)) errors.push(`${name}: duplicate ID ${id}`);
      seen.add(id);
    }
  }
  const recipes = new Set(library.recipes.map((item) => item.id));
  for (const plan of library.meal_plans) {
    for (const meal of plan.meals) {
      if (!recipes.has(meal.recipe_id)) errors.push(`meal_plans ${plan.week_of}: missing recipe ${meal.recipe_id}`);
    }
  }
  for (const item of library.shopping) {
    if (item.source_recipe_id && !recipes.has(item.source_recipe_id)) errors.push(`shopping ${item.id}: missing recipe ${item.source_recipe_id}`);
  }
  for (const item of library.cook_progress) {
    if (!recipes.has(item.recipe_id)) errors.push(`cook_progress: missing recipe ${item.recipe_id}`);
  }
  return errors.length ? { errors } : { backup: parsed.data, errors };
}

export async function exportBackup(): Promise<string> {
  return JSON.stringify({
    format: "all-around-food",
    version: 1,
    exported_at: new Date().toISOString(),
    library: await readSnapshot(),
  } satisfies BackupEnvelope);
}

type ReplaceOptions = { confirmed?: boolean; preRestoreBackup?: string };

export async function restoreBackup(
  json: string,
  mode: "merge" | "replace",
  options: ReplaceOptions = {},
): Promise<MigrationReport> {
  const report = emptyReport();
  const { backup, errors } = parseBackup(json);
  report.validation_errors.push(...errors);
  if (!backup) return report;
  let preRestoreLibrary: LibrarySnapshot | undefined;
  if (mode === "replace") {
    if (!options.confirmed || !options.preRestoreBackup) {
      report.validation_errors.push("Replace requires explicit confirmation and a downloaded pre-restore backup.");
      return report;
    }
    const pre = parseBackup(options.preRestoreBackup);
    if (!pre.backup) {
      report.validation_errors.push("Pre-restore backup is invalid.");
      return report;
    }
    preRestoreLibrary = pre.backup.library;
  }

  try {
    const db = await getLocalDB();
    const tx = db.transaction([...storeNames], "readwrite");
    void tx.done.catch(() => undefined);
    try {
      if (mode === "replace") {
        const current = LibrarySchema.parse(Object.fromEntries(await Promise.all(
          storeNames.map(async (name) => [name, await tx.objectStore(name).getAll()]),
        )));
        if (JSON.stringify(preRestoreLibrary) !== JSON.stringify(current)) {
          report.validation_errors.push("Local library changed after the pre-restore backup. Download a new backup.");
          await tx.done;
          return report;
        }
        for (const name of storeNames) await tx.objectStore(name).clear();
      }
      for (const name of storeNames) {
        const store = tx.objectStore(name);
        for (const item of backup.library[name]) {
          const id = String(item[keys[name] as keyof typeof item]);
          if (mode === "merge" && await store.get(id)) {
            report.stores[name].skipped++;
          } else {
            await store.put(item as never);
            report.stores[name].inserted++;
          }
        }
      }
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* already aborted or committed */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue("Unable to restore the local library.", error);
    throw error;
  }
  notifyChange();
  return report;
}
