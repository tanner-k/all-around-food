import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { deleteDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { readSnapshot } from "@/lib/local/repository";
import { syncLibraryOnce } from "@/lib/local/sync";
import type { RemoteRecord } from "@/lib/local/sync-codecs";
import { LocalScreens } from "../LocalScreens";
import { LocalImports } from "../LocalImports";
const owner = "11111111-1111-4111-8111-111111111111";
const recipe = recipeFixture();
const draft = { id: recipe.id, recipe, warnings: [], received_at: recipe.created_at };
beforeEach(async () => { signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); selectVerifiedAccount(owner); window.location.hash = "#/import"; });
afterEach(async () => { signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); });
async function pull(kind: "recipe" | "draft", revision: number, payload: unknown, deleted = false) {
  const record = { kind, entity_id: recipe.id, schema_version: 1, revision, payload, deleted, updated_at: recipe.created_at } as RemoteRecord;
  const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { throw Error("Unexpected upload"); }, pull: async () => ({ protocol_version: 1, batches: [{ revision, records: [record] }], next_revision: revision, has_more: false }) } });
  expect(result.error).toBeUndefined();
}
it.each([false, true])("retains recipe edits and rejects stale Save after remote deletion=%s", async deleted => {
  await pull("recipe", 1, recipe);
  const view = render(<LocalScreens route={{ view: "edit", recipeId: recipe.id }} snapshot={await readSnapshot()} />);
  fireEvent.change(screen.getByDisplayValue(recipe.title), { target: { value: "My unsaved toast" } });
  const remote = { ...recipe, notes: "Other device notes" };
  await pull("recipe", 2, deleted ? null : remote, deleted);
  view.rerender(<LocalScreens route={{ view: "edit", recipeId: recipe.id }} snapshot={await readSnapshot()} />);
  expect(screen.getByDisplayValue("My unsaved toast")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(/changed|deleted/i);
  expect(screen.getByDisplayValue("My unsaved toast")).toBeInTheDocument();
  const db = await getLocalDB(); expect(await db.get("recipes", recipe.id)).toEqual(deleted ? undefined : remote);
  expect(await db.getAll("sync_outbox")).toEqual([]);
});
it.each(["autosave", "save", "delete"])("retains draft text and rejects stale %s", async action => {
  await pull("draft", 1, draft);
  const view = render(<LocalImports drafts={[draft]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const remote = { ...draft, recipe: { ...recipe, notes: "Other device notes" } };
  await act(async () => { await pull("draft", 2, action === "delete" ? null : remote, action === "delete"); });
  view.rerender(<LocalImports drafts={(await readSnapshot()).drafts} />);
  expect(screen.getByLabelText("Recipe title")).toHaveValue(recipe.title);
  if (action === "save") fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  else fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "My unsaved draft" } });
  await screen.findByText(/changed|deleted/i);
  if (action !== "save") expect(screen.getByLabelText("Recipe title")).toHaveValue("My unsaved draft");
  const db = await getLocalDB(); expect(await db.get("drafts", recipe.id)).toEqual(action === "delete" ? undefined : remote);
  expect(await db.getAll("recipes")).toEqual([]); expect(await db.getAll("sync_outbox")).toEqual([]);
});
it.each(["", "   "])("clear/retype title %j saves without invalid predecessor and propagates recipe/tombstone", async blank => {
  await pull("draft", 1, draft);
  render(<LocalImports drafts={[draft]} />); fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: blank } });
  expect(await screen.findByRole("alert")).toHaveTextContent(/unsaved.*title/i);
  const db = await getLocalDB(); expect(await db.get("drafts", recipe.id)).toEqual(draft); expect(await db.getAll("sync_outbox")).toEqual([]);
  expect(screen.getByLabelText("Recipe title")).toHaveValue(blank);
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "R" } });
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "Replacement toast" } });
  fireEvent.change(screen.getByLabelText("Servings"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  await waitFor(() => expect(window.location.hash).toBe(`#/cookbook/${recipe.id}`));
  const received: RemoteRecord[] = []; let revision = 1;
  const result = await act(async () => syncLibraryOnce({ verifiedOwnerId: owner, transport: {
    push: async request => {
      for (const change of request.changes) if (!change.deleted) {
        const payload = change.payload as { recipe?: typeof recipe; title?: string };
        expect((payload.recipe?.title ?? payload.title)?.trim()).toBeTruthy();
      }
      const records = request.changes.map(change => ({ ...change, revision: ++revision, schema_version: 1, updated_at: recipe.created_at })) as RemoteRecord[];
      records.forEach(record => { record.revision = revision; }); received.push(...records);
      return { status: "accepted", revision, records };
    },
    pull: async afterRevision => ({ protocol_version: 1, batches: [], next_revision: afterRevision, has_more: false }),
  } }));
  expect(result.error).toBeUndefined(); expect(await db.getAll("sync_outbox")).toEqual([]);
  expect(received).toContainEqual(expect.objectContaining({ kind: "recipe", payload: expect.objectContaining({ title: "Replacement toast", servings: 4 }) }));
  expect(received).toContainEqual(expect.objectContaining({ kind: "draft", deleted: true, payload: null }));
});
