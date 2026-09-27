import type { IDBPTransaction } from "idb";
import type { LocalDBSchema } from "./db";
import { MealPlanSchema, withPlannedMealIds, plannedOccurrences, type MealPlan } from "@/lib/meal-plan-schema";
import { PantryItemSchema, type PantryItem, type PantryStatus } from "@/lib/pantry-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { ShoppingListItemSchema, CanonicalShoppingItemSchema, type ShoppingListItem } from "@/lib/shopping-schema";
import { aggregatePlannedIngredients, aggregateRecipeIngredients, categorize, recomputeAllFlags } from "@/lib/shopping-logic";
import { normalizeName } from "@/lib/normalize";
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, isCurrentLocalAccount, reportAccountStorageFailure, type LocalAccount } from "./db";
import { enqueueSyncGroup, type LocalSyncChange } from "./sync-state";
import {
  CookProgressSchema,
  CookProgressPatchSchema,
  RecipeDraftSchema,
  SettingSchema,
  type CookProgress,
  type CookProgressPatch,
  type LibrarySnapshot,
  type Setting,
} from "./schema";

const CHANGE_EVENT = "aaf-local-storage-change";
let channel: BroadcastChannel | undefined;

export function notifyChange(account: LocalAccount = captureLocalAccount()): void {
  if (!isCurrentLocalAccount(account)) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: account.dbName }));
  if (typeof BroadcastChannel !== "undefined") {
    channel ??= new BroadcastChannel(CHANGE_EVENT);
    channel.postMessage(account.dbName);
  }
}

/** Refresh a mounted view after commits, focus changes, or another tab commits. */
export function subscribeToLocalChanges(refresh: () => void, account: LocalAccount = captureLocalAccount()): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = (event: Event | MessageEvent) => {
    if (isCurrentLocalAccount(account) && (event.type === "focus" || ("data" in event ? event.data : (event as CustomEvent).detail) === account.dbName)) refresh();
  };
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

export async function readSnapshot(account = captureLocalAccount()): Promise<LibrarySnapshot> {
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(
      ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "settings"],
      "readwrite",
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
    const normalizedPlans = mealPlans.map(plan => withPlannedMealIds(MealPlanSchema.parse(plan)));
    for (let index = 0; index < mealPlans.length; index++) {
      if (JSON.stringify(mealPlans[index]) !== JSON.stringify(normalizedPlans[index]))
        await tx.objectStore("meal_plans").put(normalizedPlans[index]);
    }
    await tx.done;
    assertCurrentLocalAccount(account);
    return {
      recipes: RecipeSchema.array().parse(recipes),
      meal_plans: normalizedPlans,
      shopping: ShoppingListItemSchema.array().parse(shopping),
      pantry: PantryItemSchema.array().parse(pantry),
      cook_progress: CookProgressSchema.array().parse(cookProgress),
      drafts: RecipeDraftSchema.array().parse(drafts),
      settings: SettingSchema.array().parse(settings),
    };
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to read local storage.", error);
    throw error;
  }
}

/** Expected content comes from the mounted editor, never a refreshed snapshot. */
export class RecipeEditConflict extends Error {}
export function assertRecipeUnchanged(current: Recipe | undefined, expected: Recipe | null | undefined): void {
  if (expected === undefined) return;
  if (!current && expected) throw new RecipeEditConflict("This recipe was deleted. Your edits are still here; copy them before leaving.");
  if (JSON.stringify(current ? RecipeSchema.parse(current) : null) !== JSON.stringify(expected ? RecipeSchema.parse(expected) : null))
    throw new RecipeEditConflict("This recipe changed on another device or tab. Your edits are still here; copy them before reopening the latest version.");
}

export async function putRecipe(input: Recipe, expected?: Recipe | null): Promise<void> {
  const account = captureLocalAccount();
  const recipe = RecipeSchema.parse(input);
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["recipes", "sync_outbox", "sync_shadow"], "readwrite");
    void tx.done.catch(() => undefined);
    try {
      assertRecipeUnchanged(await tx.objectStore("recipes").get(recipe.id), expected);
      await tx.objectStore("recipes").put(recipe);
      if (account.ownerId) await enqueueSyncGroup(tx, [{ kind: "recipe", entity_id: recipe.id, payload: recipe, deleted: false }]);
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* already finished */ } await tx.done.catch(() => undefined); throw error; }
  } catch (error) {
    if (error instanceof RecipeEditConflict) throw error;
    await reportAccountStorageFailure(account, "Unable to save recipe locally.", error);
    throw error;
  }
  notifyChange(account);
}

/** Delete locally; only known cloud records or queued predecessors need a tombstone. */
export async function removeRecipe(id: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["recipes", "sync_outbox", "sync_shadow"], "readwrite");
    void tx.done.catch(() => undefined);
    try {
      const recipe = await tx.objectStore("recipes").get(id);
      assertCurrentLocalAccount(account);
      if (recipe) {
        const shadow = await tx.objectStore("sync_shadow").get(`recipe:${id}`);
        const pending = (await tx.objectStore("sync_outbox").getAll()).some(group => group.changes.some(change => change.kind === "recipe" && change.entity_id === id && !change.deleted));
        assertCurrentLocalAccount(account);
        await tx.objectStore("recipes").delete(id);
        if (account.ownerId && ((shadow && !shadow.deleted) || pending))
          await enqueueSyncGroup(tx, [{ kind: "recipe", entity_id: id, payload: null, deleted: true }]);
      }
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* already finished */ } await tx.done.catch(() => undefined); throw error; }
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to delete recipe locally.", error);
    throw error;
  }
  notifyChange(account);
}

type CollectionTx = IDBPTransaction<LocalDBSchema, ("meal_plans" | "recipes" | "shopping" | "pantry" | "sync_outbox" | "sync_shadow")[], "readwrite">;
async function queueCollectionChanges(tx: CollectionTx, account: LocalAccount, changes: LocalSyncChange[]): Promise<void> {
  if (account.ownerId && changes.length) await enqueueSyncGroup(tx, changes);
}
async function commitMealPlan(tx: CollectionTx, previous: MealPlan | undefined, next: MealPlan, account: LocalAccount): Promise<void> {
  const occurrences = plannedOccurrences(next);
  const ids = new Set(occurrences.map(meal => meal.id));
  if (ids.size !== occurrences.length) throw new Error("Planned occurrence IDs must be unique.");
  const before = new Map((previous ? plannedOccurrences(previous) : []).map(meal => [meal.id, meal]));
  const changes: LocalSyncChange[] = [];
  for (const meal of occurrences) {
    if (JSON.stringify(before.get(meal.id)) !== JSON.stringify(meal))
      changes.push({ kind: "planned_meal", entity_id: meal.id, payload: meal, deleted: false });
    before.delete(meal.id);
  }
  for (const meal of before.values()) changes.push({ kind: "planned_meal", entity_id: meal.id, payload: null, deleted: true });
  for (const raw of await tx.objectStore("meal_plans").getAll()) {
    if (raw.week_of === next.week_of) continue;
    const plan = withPlannedMealIds(raw);
    const meals = plan.meals.filter(meal => !ids.has(meal.id!));
    if (meals.length !== plan.meals.length)
      await tx.objectStore("meal_plans").put({ ...plan, meals, updated_at: next.updated_at });
  }
  await tx.objectStore("meal_plans").put(withPlannedMealIds(next));
  await queueCollectionChanges(tx, account, changes);
}

export async function saveMealPlan(input: MealPlan): Promise<void> {
  const account = captureLocalAccount();
  const plan = withPlannedMealIds(MealPlanSchema.parse(input));
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["meal_plans", "sync_outbox", "sync_shadow"], "readwrite");
    const previous = await tx.objectStore("meal_plans").get(plan.week_of);
    await commitMealPlan(tx, previous, plan, account);
    await tx.done;
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to save meal plan locally.", error);
    throw error;
  }
  notifyChange(account);
}

export async function saveCookProgress(input: CookProgressPatch): Promise<void> {
  const account = captureLocalAccount();
  const progress = CookProgressPatchSchema.parse(input);
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("cook_progress", "readwrite");
    const existing = await tx.store.get(progress.recipe_id);
    if (existing?.session_id && progress.session_id && existing.session_id !== progress.session_id) {
      await tx.done;
      return;
    }
    await tx.store.put(CookProgressSchema.parse({
      ...existing,
      ...progress,
      session_id: existing?.session_id ?? progress.session_id,
      completed_at: existing?.completed_at ?? progress.completed_at ?? existing?.completed_at,
    }));
    await tx.done;
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to save cook progress locally.", error);
    throw error;
  }
  notifyChange(account);
}

/** Keep an unfinished session; start a fresh one after a completed cook. */
export async function beginCookSession(recipeId: string, forceNew = false): Promise<CookProgress> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("cook_progress", "readwrite");
    const existing = await tx.store.get(recipeId);
    const progress: CookProgress = existing && (!existing.completed_at || !forceNew)
      ? { ...existing, session_id: existing.session_id ?? crypto.randomUUID() }
      : { recipe_id: recipeId, step: 0, layout: "step", timer_end_at: null,
          paused_seconds: null, session_id: crypto.randomUUID(), completed_at: null };
    await tx.store.put(progress);
    await tx.done;
    notifyChange(account);
    return progress;
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to start cooking session.", error);
    throw error;
  }
}

/** The progress marker and cook count commit together, even across tabs. */
export async function completeCookSession(recipeId: string, sessionId: string): Promise<boolean> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
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
    notifyChange(account);
    return true;
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to complete cooking session.", error);
    throw error;
  }
}

export async function saveSetting(input: Setting, account = captureLocalAccount()): Promise<void> {
  const setting = SettingSchema.parse(input);
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("settings", "readwrite");
    await Promise.all([tx.store.put(setting), tx.done]);
  } catch (error) {
    await reportAccountStorageFailure(account, "Unable to save local settings.", error);
    throw error;
  }
  notifyChange(account);
}

export async function refreshShoppingFlags(tx: Pick<IDBPTransaction<LocalDBSchema, ("pantry" | "shopping")[], "readwrite">, "objectStore">): Promise<void> {
  const pantry = await tx.objectStore("pantry").getAll() as PantryItem[];
  const shopping = await tx.objectStore("shopping").getAll() as ShoppingListItem[];
  for (const item of recomputeAllFlags(shopping, pantry)) await tx.objectStore("shopping").put(item);
}

async function storageFailure(account: LocalAccount, message: string, error: unknown): Promise<never> {
  await reportAccountStorageFailure(account, message, error);
  throw error;
}

export async function addPlannedMeal(weekOf: string, dayIndex: number, recipeId: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["meal_plans", "sync_outbox", "sync_shadow"], "readwrite");
    const previous = await tx.objectStore("meal_plans").get(weekOf);
    const priorMeals = previous ? withPlannedMealIds(previous).meals : [];
    const meals = [...priorMeals, { id: crypto.randomUUID(), position: Math.max(-1, ...priorMeals.map(meal => meal.position!)) + 1, day_index: dayIndex, recipe_id: recipeId, servings: null }];
    await commitMealPlan(tx, previous, MealPlanSchema.parse({ week_of: weekOf, meals, updated_at: new Date().toISOString() }), account);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to update meal plan.", error); }
  notifyChange(account);
}

export async function removePlannedMeal(weekOf: string, occurrenceId: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["meal_plans", "sync_outbox", "sync_shadow"], "readwrite");
    const previous = await tx.objectStore("meal_plans").get(weekOf);
    if (!previous) { await tx.done; return; }
    const meals = withPlannedMealIds(previous).meals.filter((meal) => meal.id !== occurrenceId);
    if (meals.length === previous.meals.length) { await tx.done; return; }
    await commitMealPlan(tx, previous, MealPlanSchema.parse({ ...previous, meals, updated_at: new Date().toISOString() }), account);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to update meal plan.", error); }
  notifyChange(account);
}

export async function setPlannedServings(weekOf: string, occurrenceId: string, servings: number | null): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["meal_plans", "sync_outbox", "sync_shadow"], "readwrite");
    const previous = await tx.objectStore("meal_plans").get(weekOf);
    if (!previous) { await tx.done; return; }
    const meals = withPlannedMealIds(previous).meals.map((meal) => meal.id === occurrenceId ? { ...meal, servings } : meal);
    if (!meals.some((meal) => meal.id === occurrenceId)) { await tx.done; return; }
    await commitMealPlan(tx, previous, MealPlanSchema.parse({ ...previous, meals, updated_at: new Date().toISOString() }), account);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to update meal servings.", error); }
  notifyChange(account);
}

async function replaceShoppingRows(tx: CollectionTx, prior: ShoppingListItem[], next: ShoppingListItem[], account: LocalAccount): Promise<void> {
  const remaining = new Map(prior.map(item => [item.id, item]));
  const changes: LocalSyncChange[] = [];
  for (const item of next) {
    const payload = CanonicalShoppingItemSchema.parse(item);
    const old = remaining.get(item.id);
    if (!old || JSON.stringify(CanonicalShoppingItemSchema.parse(old)) !== JSON.stringify(payload))
      changes.push({ kind: "shopping", entity_id: item.id, payload, deleted: false });
    remaining.delete(item.id);
    await tx.objectStore("shopping").put(item);
  }
  for (const item of remaining.values()) {
    await tx.objectStore("shopping").delete(item.id);
    changes.push({ kind: "shopping", entity_id: item.id, payload: null, deleted: true });
  }
  await queueCollectionChanges(tx, account, changes);
}

export async function generateWeekShopping(weekOf: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["meal_plans", "recipes", "pantry", "shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const [plan, recipes, pantry, existing] = await Promise.all([
      tx.objectStore("meal_plans").get(weekOf), tx.objectStore("recipes").getAll(),
      tx.objectStore("pantry").getAll(), tx.objectStore("shopping").getAll(),
    ]);
    const generated = aggregatePlannedIngredients(plan ?? { week_of: weekOf, meals: [], updated_at: new Date().toISOString() }, recipes, pantry);
    const prior = new Map(existing.filter(item => item.source === "planner" && item.generated_week_of === weekOf).map(item => [item.id, item]));
    const next = generated.map(item => {
      const old = prior.get(item.id);
      return ShoppingListItemSchema.parse({ ...item, checked: old?.checked ?? false, created_at: old?.created_at ?? item.created_at });
    });
    await replaceShoppingRows(tx, [...prior.values()], next, account);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to generate weekly shopping list.", error); }
  notifyChange(account);
}

export async function addShoppingItem(name: string, quantityText = ""): Promise<ShoppingListItem> {
  const account = captureLocalAccount();
  const item = ShoppingListItemSchema.parse({ id: crypto.randomUUID(), name: name.trim(), quantity_text: quantityText.trim() || null,
    aisle: categorize(name), source: "manual", created_at: new Date().toISOString() });
  if (!item.name) throw new Error("Item name is required.");
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["shopping", "pantry", "sync_outbox", "sync_shadow"], "readwrite");
    const pantry = await tx.objectStore("pantry").getAll();
    const [flagged] = recomputeAllFlags([item], pantry);
    await tx.objectStore("shopping").put(flagged);
    await queueCollectionChanges(tx, account, [{ kind: "shopping", entity_id: item.id, payload: CanonicalShoppingItemSchema.parse(item), deleted: false }]);
    await tx.done;
    notifyChange(account);
    return flagged;
  } catch (error) { return storageFailure(account, "Unable to add shopping item.", error); }
}

export async function setShoppingChecked(id: string, checked: boolean): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const item = await tx.objectStore("shopping").get(id);
    if (item && item.checked !== checked) {
      const next = { ...item, checked };
      await tx.objectStore("shopping").put(next);
      await queueCollectionChanges(tx, account, [{ kind: "shopping", entity_id: id, payload: CanonicalShoppingItemSchema.parse(next), deleted: false }]);
    }
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to update shopping item.", error); }
  notifyChange(account);
}

export async function removeShoppingItem(id: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const item = await tx.objectStore("shopping").get(id);
    if (item) {
      await tx.objectStore("shopping").delete(id);
      await queueCollectionChanges(tx, account, [{ kind: "shopping", entity_id: id, payload: null, deleted: true }]);
    }
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to remove shopping item.", error); }
  notifyChange(account);
}

export async function addPantryItem(name: string): Promise<PantryItem> {
  const account = captureLocalAccount();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Pantry name is required.");
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["pantry", "shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const existing = (await tx.objectStore("pantry").getAll()).sort((a, b) => a.id.localeCompare(b.id)).find(item => normalizeName(item.name) === normalizeName(trimmed));
    const now = new Date().toISOString();
    const item = PantryItemSchema.parse(existing ? { ...existing, status: "in_stock", updated_at: existing.status === "in_stock" ? existing.updated_at : now } : {
      id: crypto.randomUUID(), name: trimmed, status: "in_stock", aisle: categorize(trimmed),
      created_at: now, updated_at: now,
    });
    await tx.objectStore("pantry").put(item);
    if (!existing || existing.status !== item.status)
      await queueCollectionChanges(tx, account, [{ kind: "pantry", entity_id: item.id, payload: item, deleted: false }]);
    await refreshShoppingFlags(tx);
    await tx.done;
    notifyChange(account);
    return item;
  } catch (error) { return storageFailure(account, "Unable to add pantry item.", error); }
}

export async function removePantryItem(id: string): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["pantry", "shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const item = await tx.objectStore("pantry").get(id);
    if (item) {
      await tx.objectStore("pantry").delete(id);
      await queueCollectionChanges(tx, account, [{ kind: "pantry", entity_id: id, payload: null, deleted: true }]);
    }
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to remove pantry item.", error); }
  notifyChange(account);
}

export async function setPantryStatus(id: string, status: PantryStatus): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["pantry", "shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const item = await tx.objectStore("pantry").get(id);
    if (!item) throw new Error("Pantry item was not found.");
    if (item.status === status) { await tx.done; return; }
    const next = PantryItemSchema.parse({ ...item, status, updated_at: new Date().toISOString() });
    await tx.objectStore("pantry").put(next);
    await queueCollectionChanges(tx, account, [{ kind: "pantry", entity_id: id, payload: next, deleted: false }]);
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to update pantry status.", error); }
  notifyChange(account);
}

/** Move the selected purchased rows to pantry stock in one transaction. */
export async function completeShopping(itemIds: string[]): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["shopping", "pantry", "sync_outbox", "sync_shadow"], "readwrite");
    const pantry = await tx.objectStore("pantry").getAll();
    const byName = new Map([...pantry].sort((a, b) => b.id.localeCompare(a.id)).map(item => [normalizeName(item.name), item]));
    const changes = new Map<string, LocalSyncChange>();
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
      changes.set(`pantry:${stocked.id}`, { kind: "pantry", entity_id: stocked.id, payload: stocked, deleted: false });
      await tx.objectStore("shopping").delete(id);
      changes.set(`shopping:${id}`, { kind: "shopping", entity_id: id, payload: null, deleted: true });
    }
    await queueCollectionChanges(tx, account, [...changes.values()]);
    await refreshShoppingFlags(tx);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to complete shopping.", error); }
  notifyChange(account);
}

export async function addRecipesToShopping(recipeIds: string[]): Promise<void> {
  const account = captureLocalAccount();
  try {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["recipes", "pantry", "shopping", "sync_outbox", "sync_shadow"], "readwrite");
    const [recipes, pantry, existing] = await Promise.all([
      tx.objectStore("recipes").getAll(), tx.objectStore("pantry").getAll(), tx.objectStore("shopping").getAll(),
    ]);
    const selected = recipes.filter(recipe => recipeIds.includes(recipe.id));
    const prior = existing.filter(item => item.source === "recipe");
    const next = aggregateRecipeIngredients(selected, pantry).map(item => {
      const old = prior.find(row => normalizeName(row.name) === normalizeName(item.name) && row.quantity_text === item.quantity_text);
      return ShoppingListItemSchema.parse(old ? { ...item, id: old.id, checked: old.checked, created_at: old.created_at } : item);
    });
    await replaceShoppingRows(tx, prior, next, account);
    await tx.done;
  } catch (error) { return storageFailure(account, "Unable to add recipes to shopping.", error); }
  notifyChange(account);
}
