import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDB, openDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { exportBackup } from "../backup";
import { captureLocalAccount, closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from "../db";
import { copyRecipes, previewRecipeCopy, readLegacyDeviceBackup, fetchLegacyRecipeBackup } from "../recipe-copy";
const owner = "11111111-1111-4111-8111-111111111111";
const source = (recipes = [recipeFixture()]) => JSON.stringify({ format: "all-around-food", version: 1, exported_at: "2026-09-20T12:00:00Z", library: { recipes, meal_plans: [{ broken: "ignored missing recipe" }], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] } });
async function reset() { signOutLocalAccount(); await closeLocalDB(); await deleteDB("aaf-local"); await deleteDB(`aaf-local:${owner}`); selectVerifiedAccount(owner); }
beforeEach(reset);
afterEach(async () => { vi.unstubAllGlobals(); await reset(); });
async function options() { return { confirmed: true, sourceBackup: true, destinationBackup: await exportBackup() }; }
it("reads guest records without switching identity or upgrading", async () => {
 const guest = await openDB("aaf-local", 1, { upgrade(db) { db.createObjectStore("recipes", { keyPath: "id" }); } });
 await guest.put("recipes", recipeFixture()); const account = captureLocalAccount();
 expect(JSON.parse(await readLegacyDeviceBackup(account)).library.recipes).toEqual([recipeFixture()]);
 expect(captureLocalAccount()).toBe(account); expect(guest.version).toBe(1); expect(await guest.getAll("recipes")).toEqual([recipeFixture()]); guest.close();
});
it("copies recipes only with stable IDs, aggregate, actual create intent and rerun no-op", async () => {
 const recipe = { ...recipeFixture(), title: "Niku Miso", times_made: 7 }; const preview = await previewRecipeCopy(source([recipe]));
 expect(preview.rows[0].state).toBe("new"); expect(await copyRecipes(preview, {}, await options())).toEqual({ copied: 1, kept: 0, queued: 1 });
 const db = await getLocalDB(); expect(await db.get("recipes", recipe.id)).toEqual(recipe);
 expect((await db.getAll("sync_outbox"))[0].changes[0]).toMatchObject({ kind: "recipe", entity_id: recipe.id, base_revision: null, payload: recipe });
 expect(await db.getAll("meal_plans")).toEqual([]);
 expect(await copyRecipes(await previewRecipeCopy(source([recipe])), {}, await options())).toEqual({ copied: 0, kept: 1, queued: 0 });
 expect(await db.getAll("sync_outbox")).toHaveLength(1);
});
it("enrolls identical content without a shadow or predecessor", async () => {
 const db = await getLocalDB(); await db.put("recipes", recipeFixture());
 expect(await copyRecipes(await previewRecipeCopy(source()), {}, await options())).toMatchObject({ queued: 1, copied: 0 });
 expect((await db.getAll("sync_outbox"))[0].changes[0].base_revision).toBeNull();
});
it("defaults same-ID differences to keep existing, allows explicit source choice", async () => {
 const db = await getLocalDB(); const existing = { ...recipeFixture(), title: "Account edit" }; await db.put("recipes", existing);
 let preview = await previewRecipeCopy(source()); expect(preview.rows[0].state).toBe("different");
 await copyRecipes(preview, {}, await options()); expect(await db.get("recipes", existing.id)).toEqual(existing);
 preview = await previewRecipeCopy(source()); await copyRecipes(preview, { [existing.id]: "source" }, await options()); expect(await db.get("recipes", existing.id)).toEqual(recipeFixture());
});
it("requires backups/confirmation and rejects stale preview before any write", async () => {
 const preview = await previewRecipeCopy(source()); await expect(copyRecipes(preview, {}, {})).rejects.toThrow(/backup.*confirm/i);
 const saved = await options(); const db = await getLocalDB(); await db.put("recipes", { ...recipeFixture(), title: "Changed" });
 await expect(copyRecipes(preview, {}, saved)).rejects.toThrow(/changed.*review|changed.*backup/i); expect(await db.getAll("sync_outbox")).toHaveLength(0);
 await expect(copyRecipes(preview, {}, await options())).rejects.toThrow(/changed.*review/i);
});
it("rejects captured preview after signout", async () => {
 const preview = await previewRecipeCopy(source()); const saved = await options(); signOutLocalAccount(); await expect(copyRecipes(preview, {}, saved)).rejects.toThrow(/account changed/i);
});
it("preserves matching pending draft and requires finishing its review", async () => {
 const db = await getLocalDB(); const draft = { id: "job", recipe: recipeFixture(), warnings: [], received_at: "2026-09-20T12:00:00Z" }; await db.put("drafts", draft);
 const preview = await previewRecipeCopy(source()); expect(preview.rows[0].state).toBe("draft");
 await expect(copyRecipes(preview, { [recipeFixture().id]: "source" }, await options())).rejects.toThrow(/draft.*review/i);
 expect(await db.getAll("drafts")).toEqual([draft]); expect(await db.getAll("recipes")).toHaveLength(0); expect(await db.getAll("sync_outbox")).toHaveLength(0);
});
it("keeps different IDs with same title and rejects duplicate source IDs", async () => {
 const db = await getLocalDB(); await db.put("recipes", { ...recipeFixture(), id: "other" }); await copyRecipes(await previewRecipeCopy(source()), {}, await options()); expect(await db.getAll("recipes")).toHaveLength(2);
 await expect(previewRecipeCopy(source([recipeFixture(), recipeFixture()]))).rejects.toThrow(/duplicate/i);
});
it("binds cloud request and response to destination owner", async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...JSON.parse(source()), owner_id: "other" }) }); vi.stubGlobal("fetch", fetcher);
 await expect(fetchLegacyRecipeBackup()).rejects.toThrow(/owner.*match/i); expect(fetcher.mock.calls[0][0]).toContain(`expected_owner=${owner}`);
});
it("leaves synced identical recipes without another mutation", async () => {
 const db = await getLocalDB(); await db.put("recipes", recipeFixture());
 await db.put("sync_shadow", { key: `recipe:${recipeFixture().id}`, revision: 1, payload: recipeFixture(), deleted: false });
 expect(await copyRecipes(await previewRecipeCopy(source()), {}, await options())).toEqual({ copied: 0, kept: 1, queued: 0 });
});
it("rolls back every local write and queue group when a source recipe exceeds the bound", async () => {
 const recipes = [recipeFixture(), { ...recipeFixture(), id: "huge", description: "x".repeat(1024 * 1024) }];
 await expect(copyRecipes(await previewRecipeCopy(source(recipes)), {}, await options())).rejects.toThrow(/1 MiB/);
 const db = await getLocalDB(); expect(await db.getAll("recipes")).toHaveLength(0); expect(await db.getAll("sync_outbox")).toHaveLength(0);
});
