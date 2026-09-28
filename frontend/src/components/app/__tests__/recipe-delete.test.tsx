import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { closeLocalDB, getLocalDB, selectVerifiedAccount, selectLegacyGuest, signOutLocalAccount } from "@/lib/local/db";
import * as repository from "@/lib/local/repository";
import { LocalScreens } from "../LocalScreens";
const owner = "11111111-1111-4111-8111-111111111111";
async function reset() { await closeLocalDB(); await deleteDB("aaf-local"); await deleteDB(`aaf-local:${owner}`); await deleteDB("aaf-local:other"); selectVerifiedAccount(owner); }
beforeEach(reset);
afterEach(async () => { vi.restoreAllMocks(); signOutLocalAccount(); await reset(); });
function openDeleteDialog() {
 fireEvent.click(screen.getByRole("button", { name: "Recipe options" })); fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
 return screen.getByRole("dialog", { name: "Delete recipe?" });
}
async function detail() {
 const db = await getLocalDB(); await db.put("recipes", recipeFixture());
 render(<LocalScreens route={{ view: "recipe", recipeId: recipeFixture().id }} snapshot={await repository.readSnapshot()} />);
 return db;
}
it("keeps the recipe when confirmation is cancelled", async () => {
 const db = await detail(); const dialog = openDeleteDialog(); fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 expect(await db.get("recipes", recipeFixture().id)).toBeTruthy(); expect(await db.getAll("sync_outbox")).toHaveLength(0);
});
it("deletes a synced recipe and queues its tombstone before returning to cookbook", async () => {
 const db = await detail(); await db.put("sync_shadow", { key: `recipe:${recipeFixture().id}`, revision: 3, payload: recipeFixture(), deleted: false });
 fireEvent.click(within(openDeleteDialog()).getByRole("button", { name: "Delete" }));
 await waitFor(() => expect(window.location.hash).toBe("#/cookbook")); expect(await db.get("recipes", recipeFixture().id)).toBeUndefined();
 expect((await db.getAll("sync_outbox"))[0].changes[0]).toMatchObject({ kind: "recipe", entity_id: recipeFixture().id, deleted: true, payload: null, base_revision: 3 });
});
it("rejects deletion if identity switches during confirmation", async () => {
 await detail(); const dialog = openDeleteDialog(); selectVerifiedAccount("other");
 fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })); expect(await screen.findByRole("alert")).toHaveTextContent(/account changed/i);
 expect(await (await getLocalDB()).getAll("sync_outbox")).toHaveLength(0);
 selectVerifiedAccount(owner); expect(await (await getLocalDB()).get("recipes", recipeFixture().id)).toBeTruthy();
});
it("chains an unsent creation to an offline deletion", async () => {
 await repository.putRecipe(recipeFixture()); await repository.removeRecipe(recipeFixture().id);
 const db = await getLocalDB(); const groups = (await db.getAll("sync_outbox")).sort((a,b) => a.sequence - b.sequence);
 expect(groups).toHaveLength(2); expect(groups[1].depends_on).toEqual([groups[0].mutation_id]); expect(groups[1].changes[0].deleted).toBe(true);
 expect(await db.getAll("recipes")).toHaveLength(0);
});
it("deletes guest or unenrolled local recipes without invalid null-base tombstones", async () => {
 const db = await getLocalDB(); await db.put("recipes", recipeFixture()); await repository.removeRecipe(recipeFixture().id);
 expect(await db.getAll("sync_outbox")).toHaveLength(0); expect(await db.getAll("recipes")).toHaveLength(0);
 await repository.removeRecipe(recipeFixture().id); expect(await db.getAll("sync_outbox")).toHaveLength(0);
 selectLegacyGuest(); await repository.putRecipe(recipeFixture()); await repository.removeRecipe(recipeFixture().id);
 expect((await repository.readSnapshot()).recipes).toHaveLength(0); expect(await (await getLocalDB()).getAll("sync_outbox")).toHaveLength(0);
});
