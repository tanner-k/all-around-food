import { openDB } from "idb";
import { z } from "zod";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, type LocalAccount } from "./db";
import { notifyChange, readSnapshot } from "./repository";
import { enqueueSyncGroup, syncEntityKey } from "./sync-state";
import type { LibrarySnapshot } from "./schema";

const SourceSchema = z.object({ format: z.literal("all-around-food"), version: z.literal(1), library: z.object({ recipes: z.array(RecipeSchema.extend({ id: z.string().min(1) })) }) });
export function parseRecipeCopySource(json: string): Recipe[] {
  const recipes = SourceSchema.parse(JSON.parse(json)).library.recipes;
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new Error("Source contains duplicate recipe IDs.");
  return recipes;
}
export type RecipeCopyPreview = {
  account: LocalAccount; sourceJson: string; destination: Pick<LibrarySnapshot, "recipes" | "drafts">;
  rows: { source: Recipe; existing?: Recipe; state: "new" | "same" | "different" | "draft" }[];
};
const content = (value: unknown) => JSON.stringify(value);
function recipeLibrary(snapshot: Pick<LibrarySnapshot, "recipes" | "drafts">) { return { recipes: snapshot.recipes, drafts: snapshot.drafts }; }
export async function previewRecipeCopy(sourceJson: string, account = captureLocalAccount()): Promise<RecipeCopyPreview> {
  assertCurrentLocalAccount(account);
  if (!account.ownerId) throw new Error("Sign in before copying recipes into your account.");
  const recipes = parseRecipeCopySource(sourceJson);
  const destination = recipeLibrary(await readSnapshot(account));
  assertCurrentLocalAccount(account);
  return { account, sourceJson, destination, rows: recipes.map(source => {
    const existing = destination.recipes.find(recipe => recipe.id === source.id);
    const draft = destination.drafts.some(item => item.recipe.id === source.id);
    return { source, existing, state: draft ? "draft" : !existing ? "new" : content(existing) === content(source) ? "same" : "different" };
  }) };
}

/** Read the fixed guest source with no version request, upgrade, account selection, or writes. */
export async function readLegacyDeviceBackup(account = captureLocalAccount()): Promise<string> {
  assertCurrentLocalAccount(account);
  const db = await openDB("aaf-local", undefined, { upgrade(_db, oldVersion, _newVersion, tx) { if (!oldVersion) tx.abort(); } });
  try {
    assertCurrentLocalAccount(account);
    const names = ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "settings"];
    const available = names.filter(name => db.objectStoreNames.contains(name));
    const tx = db.transaction(available, "readonly");
    const entries = await Promise.all(available.map(async name => [name, await tx.objectStore(name).getAll()]));
    await tx.done;
    assertCurrentLocalAccount(account);
    return JSON.stringify({ format: "all-around-food", version: 1, exported_at: new Date().toISOString(), library: { ...Object.fromEntries(names.map(name => [name, []])), ...Object.fromEntries(entries) } });
  } finally { db.close(); }
}
export async function fetchLegacyRecipeBackup(account = captureLocalAccount()): Promise<string> {
  assertCurrentLocalAccount(account);
  if (!account.ownerId) throw new Error("Sign in before exporting cloud recipes.");
  const response = await fetch(`/api/export?scope=recipes&expected_owner=${encodeURIComponent(account.ownerId)}`, { cache: "no-store" });
  const body = await response.json();
  assertCurrentLocalAccount(account);
  if (!response.ok) throw new Error(body.error ?? "Unable to export cloud recipes.");
  if (body.owner_id !== account.ownerId) throw new Error("Cloud export owner does not match this account. Sign in again.");
  const json = JSON.stringify(body);
  parseRecipeCopySource(json);
  return json;
}

type CopyOptions = { confirmed?: boolean; sourceBackup?: boolean; destinationBackup?: string };
/** One local transaction; each recipe's content and bounded outbox intent commit together. */
export async function copyRecipes(preview: RecipeCopyPreview, choices: Record<string, "existing" | "source">, options: CopyOptions): Promise<{ copied: number; kept: number; queued: number }> {
  const { account } = preview;
  assertCurrentLocalAccount(account);
  if (!options.confirmed || !options.sourceBackup || !options.destinationBackup) throw new Error("Download source and account backups, then confirm they are saved before copying.");
  const backup = SourceSchema.extend({ library: z.object({ recipes: z.array(RecipeSchema), drafts: z.array(z.unknown()) }) }).parse(JSON.parse(options.destinationBackup));
  const db = await getLocalDB(account);
  assertCurrentLocalAccount(account);
  const tx = db.transaction(["recipes", "drafts", "sync_shadow", "sync_outbox"], "readwrite");
  void tx.done.catch(() => undefined);
  const result = { copied: 0, kept: 0, queued: 0 };
  try {
    const current = { recipes: await tx.objectStore("recipes").getAll(), drafts: await tx.objectStore("drafts").getAll() };
    if (content(current) !== content(preview.destination)) throw new Error("Account recipes or drafts changed after review. Preview again.");
    if (content(current) !== content(recipeLibrary(backup.library as Pick<LibrarySnapshot, "recipes" | "drafts">))) throw new Error("Account library changed after backup. Download a fresh backup.");
    for (const row of preview.rows) {
      assertCurrentLocalAccount(account);
      if (row.state === "draft") {
        if (choices[row.source.id] === "source") throw new Error("A pending draft needs review in Imports before copying this recipe.");
        result.kept++; continue;
      }
      const recipe = row.state === "different" && choices[row.source.id] !== "source" ? row.existing! : row.source;
      if (content(recipe) !== content(row.existing)) { await tx.objectStore("recipes").put(recipe); result.copied++; }
      else result.kept++;
      const shadow = await tx.objectStore("sync_shadow").get(syncEntityKey("recipe", recipe.id));
      const pending = (await tx.objectStore("sync_outbox").getAll()).some(group => group.changes.some(change => change.kind === "recipe" && change.entity_id === recipe.id));
      if (content(recipe) !== content(row.existing) || (!shadow && !pending)) {
        await enqueueSyncGroup(tx, [{ kind: "recipe", entity_id: recipe.id, payload: recipe, deleted: false }]); result.queued++;
      }
    }
    assertCurrentLocalAccount(account);
    await tx.done;
  } catch (error) { try { tx.abort(); } catch { /* already finished */ } await tx.done.catch(() => undefined); throw error; }
  assertCurrentLocalAccount(account);
  notifyChange(account);
  return result;
}
