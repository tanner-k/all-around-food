import { beforeEach, afterEach, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { captureLocalAccount, closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from "../db";
import { putRecipe, readSnapshot } from "../repository";
import { enqueueSyncGroup } from "../sync-state";
import { exportBackup } from "../backup";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

beforeEach(async () => {
  signOutLocalAccount();
  await closeLocalDB();
  await deleteDB("aaf-local");
  await deleteDB(`aaf-local:${a}`);
  await deleteDB(`aaf-local:${b}`);
});
afterEach(async () => {
  signOutLocalAccount();
  await closeLocalDB();
  await deleteDB("aaf-local");
  await deleteDB(`aaf-local:${a}`);
  await deleteDB(`aaf-local:${b}`);
});

it("keeps account records and queued edits isolated across sign-out", async () => {
  selectVerifiedAccount(a);
  await putRecipe(recipeFixture());
  const accountA = captureLocalAccount();
  const dbA = await getLocalDB(accountA);
  expect(await dbA.getAll("sync_outbox")).toHaveLength(1);
  signOutLocalAccount();
  await expect(readSnapshot()).rejects.toThrow();
  selectVerifiedAccount(b);
  expect((await readSnapshot()).recipes).toHaveLength(0);
  expect(await (await getLocalDB()).getAll("sync_outbox")).toHaveLength(0);
  selectVerifiedAccount(a);
  expect((await (await getLocalDB()).getAll("recipes"))).toHaveLength(1);
});

it("commits the recipe and its pending group together", async () => {
  selectVerifiedAccount(a);
  const recipe = recipeFixture();
  await putRecipe(recipe);
  const db = await getLocalDB();
  const pending = await db.getAll("sync_outbox");
  expect(pending).toHaveLength(1);
  expect(pending[0].changes).toMatchObject([{ kind: "recipe", entity_id: recipe.id, payload: recipe }]);
  await putRecipe({ ...recipe, title: "New title" });
  const groups = await db.getAll("sync_outbox");
  expect(groups).toHaveLength(2);
  const first = groups.find((row) => row.sequence === 1)!;
  const second = groups.find((row) => row.sequence === 2)!;
  expect(second.depends_on).toEqual([first.mutation_id]);
});

it("aborting a transaction rolls back both entity and outbox", async () => {
  selectVerifiedAccount(a);
  const db = await getLocalDB();
  const tx = db.transaction(["recipes", "sync_outbox", "sync_shadow"], "readwrite");
  const recipe = recipeFixture();
  await tx.objectStore("recipes").put(recipe);
  await enqueueSyncGroup(tx, [{ kind: "recipe", entity_id: recipe.id, payload: recipe, deleted: false }]);
  void tx.done.catch(() => undefined);
  tx.abort();
  await expect(tx.done).rejects.toThrow();
  expect(await db.getAll("recipes")).toHaveLength(0);
  expect(await db.getAll("sync_outbox")).toHaveLength(0);
});

it("retains a committed outbox group after closing and reopening storage", async () => {
  selectVerifiedAccount(a);
  await putRecipe(recipeFixture());
  await closeLocalDB();
  const db = await getLocalDB();
  expect(await db.getAll("sync_outbox")).toHaveLength(1);
  expect(await db.getAll("recipes")).toHaveLength(1);
});

it("serializes overlapping edits in two tabs through one outbox store", async () => {
  selectVerifiedAccount(a);
  const recipe = recipeFixture();
  await Promise.all([
    putRecipe(recipe),
    putRecipe({ ...recipe, title: "Other tab edit" }),
  ]);
  const rows = await (await getLocalDB()).getAll("sync_outbox");
  expect(rows).toHaveLength(2);
  const [first, second] = rows.sort((left, right) => left.sequence - right.sequence);
  expect(second.depends_on).toEqual([first.mutation_id]);
});

it("upgrades a version-one database after another tab closes its connection", async () => {
  const name = `aaf-local:${a}`;
  const oldTab = await openDB(name, 1, {
    upgrade(db) {
      for (const [store, key] of [
        ["recipes", "id"], ["meal_plans", "week_of"], ["shopping", "id"],
        ["pantry", "id"], ["cook_progress", "recipe_id"], ["drafts", "id"],
        ["imports", "id"], ["settings", "key"],
      ]) db.createObjectStore(store, { keyPath: key });
    },
    blocking() { oldTab.close(); },
  });
  selectVerifiedAccount(a);
  const upgraded = await getLocalDB();
  expect(upgraded.objectStoreNames.contains("sync_outbox")).toBe(true);
  expect(upgraded.objectStoreNames.contains("sync_meta")).toBe(true);
});

it("rejects a snapshot started under A after B becomes active", async () => {
  selectVerifiedAccount(a);
  const pending = readSnapshot();
  signOutLocalAccount();
  selectVerifiedAccount(b);
  await expect(pending).rejects.toThrow("Local account changed");
  expect((await readSnapshot()).recipes).toHaveLength(0);
});


it("rolls back an entity when its sync group is too large", async () => {
  selectVerifiedAccount(a);
  const db = await getLocalDB();
  const tx = db.transaction(["recipes", "sync_outbox", "sync_shadow"], "readwrite");
  const recipe = recipeFixture();
  await tx.objectStore("recipes").put(recipe);
  void tx.done.catch(() => undefined);
  await expect(enqueueSyncGroup(tx, [{ kind: "recipe", entity_id: recipe.id,
    payload: "x".repeat(1024 * 1024 + 1), deleted: false }])).rejects.toThrow("1 MiB");
  await expect(tx.done).rejects.toThrow();
  expect(await db.getAll("recipes")).toHaveLength(0);
});


it("keeps a frozen upload unchanged when a newer recipe edit arrives", async () => {
  selectVerifiedAccount(a);
  const recipe = recipeFixture();
  await putRecipe(recipe);
  const db = await getLocalDB();
  const [first] = await db.getAll("sync_outbox");
  await db.put("sync_outbox", { ...first, status: "frozen" });
  await putRecipe({ ...recipe, title: "Edited during upload" });
  const frozen = await db.get("sync_outbox", first.mutation_id);
  const groups = await db.getAll("sync_outbox");
  const later = groups.find((group) => group.mutation_id !== first.mutation_id)!;
  expect(frozen?.changes[0].payload).toEqual(recipe);
  expect(later.depends_on).toEqual([first.mutation_id]);
  expect(later.changes[0].payload).toMatchObject({ title: "Edited during upload" });
});


it("does not export A data after B becomes active", async () => {
  selectVerifiedAccount(a);
  await putRecipe(recipeFixture());
  await closeLocalDB();
  const exporting = exportBackup();
  signOutLocalAccount();
  selectVerifiedAccount(b);
  await expect(exporting).rejects.toThrow("Local account changed");
  const exportedB = JSON.parse(await exportBackup()) as { library: { recipes: unknown[] } };
  expect(exportedB.library.recipes).toHaveLength(0);
});
