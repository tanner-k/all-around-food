import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from "../db";
import { acceptDraft, flushLocalImports, receiveImportDraft, retryLocalImport, queueLocalImport } from "../imports";
import { syncLibraryOnce } from "../sync";
import { retryJob, getJob, type ParseJob } from "@/lib/db/parseJobs";
const { listImportJobs, ackJob, createClient } = vi.hoisted(() => ({ listImportJobs: vi.fn(), ackJob: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/db/parseJobs", async (importOriginal) => ({ ImportQueueJobSchema: (await importOriginal<typeof import("@/lib/db/parseJobs")>()).ImportQueueJobSchema, listImportJobs, ackJob, getJob: vi.fn(), enqueueImageJob: vi.fn(), enqueueTextJob: vi.fn(), enqueueUrlJob: vi.fn(), retryJob: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient }));
const owner = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stamp = "2026-09-25T00:00:00Z";
const recipe = () => ({ ...recipeFixture(), id });
const draft = () => ({ id, recipe: recipe(), warnings: ["Check servings"], received_at: stamp });
const remote = (status = "done") => ({ id, kind: "url", source_url: "https://example.com/toast", status, attempts: 1, error: null, acknowledged_at: null, expires_at: stamp, created_at: stamp, updated_at: stamp });
const done = () => ({ ...remote(), result_recipe_json: recipe(), result_warnings: ["Check servings"] } as ParseJob);
const wire = (kind: "draft" | "recipe", revision: number, payload: unknown, deleted = false) => ({ kind, entity_id: id, schema_version: 1, revision, payload, deleted, updated_at: stamp });
beforeEach(async () => {
  signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); selectVerifiedAccount(owner);
  vi.resetAllMocks(); listImportJobs.mockResolvedValue([]); ackJob.mockResolvedValue(done());
  createClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) } });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(async () => { signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); });
it("discovers another device's blocked and completed metadata without local jobs or remote bytes", async () => {
  listImportJobs.mockResolvedValue([{ ...remote("error"), error: "This source is blocked. Paste its caption instead." }, { ...remote("done"), id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]);
  await flushLocalImports();
  const db = await getLocalDB(); const rows = await db.getAll("imports");
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.id === id)).toMatchObject({ state: "error", error: expect.stringContaining("blocked"), upload: null, payload_text: null });
  expect(rows.find(row => row.id !== id)).toMatchObject({ state: "submitted", remote_status: "done" });
  expect(await db.getAll("drafts")).toEqual([]); expect(await db.getAll("sync_outbox")).toEqual([]);
  expect(ackJob).not.toHaveBeenCalled();
});
it("receives through library sync and saves one conditional group for another device", async () => {
  listImportJobs.mockResolvedValue([remote()]); await flushLocalImports();
  await receiveImportDraft(done());
  const db = await getLocalDB(); expect(await db.getAll("drafts")).toEqual([]); expect(await db.getAll("sync_outbox")).toEqual([]);
  const first = wire("draft", 1, draft());
  await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { throw Error("unexpected upload"); }, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [first] }], next_revision: 1, has_more: false }) } });
  await flushLocalImports(); expect(ackJob).toHaveBeenCalledWith(id);
  expect(await db.get("imports", id)).toMatchObject({ state: "draft" });
  await acceptDraft(id, { ...recipe(), title: "Reviewed on phone" });
  const [saved] = await db.getAll("sync_outbox");
  expect(saved.changes).toMatchObject([{ kind: "recipe", base_revision: null }, { kind: "draft", base_revision: 1, deleted: true }]);
  const savedRecipe = { ...recipe(), title: "Reviewed on phone" };
  const records = [wire("recipe", 2, savedRecipe), wire("draft", 2, null, true)];
  await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => ({ status: "accepted", revision: 2, records }), pull: async () => ({ protocol_version: 1, batches: [{ revision: 2, records }], next_revision: 2, has_more: false }) } });
  await receiveImportDraft(done()); expect(await db.get("drafts", id)).toBeUndefined(); expect(await db.get("recipes", id)).toEqual(savedRecipe);
  expect(await db.getAll("sync_outbox")).toEqual([]);
  // A fresh browser profile downloads the retained revision journal after queue cleanup.
  await closeLocalDB(); await deleteDB(`aaf-local:${owner}`);
  await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => null, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [first] }, { revision: 2, records }], next_revision: 2, has_more: false }) } });
  expect(await (await getLocalDB()).get("recipes", id)).toEqual(savedRecipe); expect(await (await getLocalDB()).getAll("drafts")).toEqual([]);
});
it("saves a synced restored draft without inventing a transient job", async () => {
  await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => null, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [wire("draft", 1, draft())] }], next_revision: 1, has_more: false }) } });
  await acceptDraft(id, recipe()); const db = await getLocalDB();
  expect(await db.get("imports", id)).toBeUndefined();
  expect((await db.getAll("sync_outbox"))[0].changes[1]).toMatchObject({ kind: "draft", base_revision: 1, deleted: true });
});

it("queues a predecessor for an unknown restored draft and resolves the Save base on receipt", async () => {
  const db = await getLocalDB(); await db.put("drafts", draft());
  await acceptDraft(id, recipe());
  const queued = (await db.getAll("sync_outbox")).sort((a, b) => a.sequence - b.sequence);
  expect(queued).toHaveLength(2); expect(queued[1].depends_on).toEqual([queued[0].mutation_id]);
  expect(await db.get("imports", id)).toBeUndefined();
  await acceptDraft(id, recipe()); expect(await db.getAll("sync_outbox")).toHaveLength(2);
  const bases: (number | null)[] = [];
  let pushes = 0;
  const transport = {
    push: async (request: import("@/lib/db/librarySync").PushRequest) => {
      if (++pushes === 1) { bases.push(request.changes[0].base_revision); return { status: "accepted", revision: 7, records: [wire("draft", 7, draft())] }; }
      bases.push(request.changes[1].base_revision);
      return { status: "accepted", revision: 8, records: [wire("recipe", 8, recipe()), wire("draft", 8, null, true)] };
    },
    pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }),
  };
  await syncLibraryOnce({ verifiedOwnerId: owner, transport });
  await syncLibraryOnce({ verifiedOwnerId: owner, transport });
  expect(bases).toEqual([null, 7]); expect(await db.getAll("sync_outbox")).toEqual([]);
});

it("queues a conditional recipe update with the draft tombstone when both records are known", async () => {
  const db = await getLocalDB(); await db.put("drafts", draft()); await db.put("recipes", recipe());
  await db.put("sync_shadow", { key: `draft:${id}`, revision: 3, payload: draft(), deleted: false });
  await db.put("sync_shadow", { key: `recipe:${id}`, revision: 4, payload: recipe(), deleted: false });
  await acceptDraft(id, { ...recipe(), title: "Reviewed update" });
  const [group] = await db.getAll("sync_outbox");
  expect(group.changes).toMatchObject([{ kind: "recipe", base_revision: 4, payload: { title: "Reviewed update" } }, { kind: "draft", base_revision: 3, deleted: true }]);
  expect(await db.get("drafts", id)).toBeUndefined();
});

it.each(["text", "url", "video"] as const)("preserves a discovered expired %s import when its source is unavailable", async (kind) => {
  listImportJobs.mockResolvedValue([{ ...remote("error"), kind, source_url: null, attempts: 3, error: "Import expired; submit again" }]);
  await flushLocalImports();
  const db = await getLocalDB(); const original = await db.get("imports", id);
  await expect(retryLocalImport(id)).rejects.toThrow(kind === "text" ? "Paste the recipe text" : "Enter the recipe URL");
  expect(await db.getAll("imports")).toEqual([original]);
  await flushLocalImports(); expect(await db.getAll("imports")).toEqual([original]);
});
it.each(["text", "url", "video"] as const)("preserves a discovered exhausted %s import when its source is unavailable", async (kind) => {
  const failed = { ...remote("error"), kind, source_url: null, attempts: 3, error: "Import attempts exhausted" };
  listImportJobs.mockResolvedValue([failed]); await flushLocalImports();
  vi.mocked(retryJob).mockRejectedValueOnce(new Error("import cannot be retried"));
  vi.mocked(getJob).mockResolvedValueOnce(failed as ParseJob);
  const db = await getLocalDB(); const original = await db.get("imports", id);
  await expect(retryLocalImport(id)).rejects.toThrow(kind === "text" ? "Paste the recipe text" : "Enter the recipe URL");
  expect(await db.getAll("imports")).toEqual([original]);
});
it.each(["text", "url", "video"] as const)("retries an expired same-device %s import with its retained source", async (kind) => {
  const local = await queueLocalImport({ kind, source_url: kind === "text" ? null : "https://example.com/toast", payload_text: kind === "text" ? "Toast bread" : null });
  const db = await getLocalDB(); await db.put("imports", { ...local, state: "error", error: "Import expired; submit again" });
  const replacement = await retryLocalImport(local.id);
  expect(replacement).toMatchObject({ state: "queued", source_url: local.source_url, payload_text: local.payload_text });
  expect((await db.get("imports", local.id))?.replacement_id).toBe(replacement.id);
});
