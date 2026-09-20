import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IDBPObjectStore } from "idb";
// Set the Blob constructor before the Zod schema imports it. Node's Blob survives
// fake-indexeddb's native structuredClone, unlike jsdom's Blob.
vi.hoisted(async () => {
  const { Blob, File } = await import("node:buffer");
  globalThis.Blob = Blob as unknown as typeof globalThis.Blob;
  globalThis.File = File as unknown as typeof globalThis.File;
});
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { ParseJob } from "@/lib/db/parseJobs";
import { closeLocalDB, getLocalDB, type LocalDBSchema } from "../db";
import {
  acceptDraft,
  flushLocalImports,
  queueLocalImport,
  receiveImportDraft,
  retryLocalImport,
  updateImportDraft,
  reselectScreenshotImport,
} from "../imports";

const { enqueueUrlJob, enqueueImageJob, enqueueTextJob, getJob, ackJob, retryJob, createClient } = vi.hoisted(() => ({
  enqueueUrlJob: vi.fn(), enqueueImageJob: vi.fn(), enqueueTextJob: vi.fn(),
  getJob: vi.fn(), ackJob: vi.fn(), retryJob: vi.fn(), createClient: vi.fn(),
}));
vi.mock("@/lib/db/parseJobs", () => ({
  enqueueUrlJob, enqueueImageJob, enqueueTextJob, getJob, ackJob, retryJob,
  classifyUrlKind: () => "url",
}));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const jobId = "00000000-0000-4000-8000-000000000001";
const replacementId = "00000000-0000-4000-8000-000000000002";
const clock = "2026-09-20T12:00:00Z";
let currentUser: string | null;

function job(id: string, status: ParseJob["status"] = "pending"): ParseJob {
  return {
    id, kind: "url", source_url: "https://example.com/toast", storage_path: null,
    payload_text: null, status, attempts: 0, error: null, result_recipe_id: null,
    result_recipe_json: status === "done" ? { ...recipeFixture(), id } : null,
    result_warnings: status === "done" ? ["Check servings"] : [],
    lease_until: null, claim_token: null, acknowledged_at: null,
    expires_at: clock, created_at: clock, updated_at: clock,
  };
}

async function records(id = jobId) {
  const db = await getLocalDB();
  return {
    import: await db.get("imports", id),
    draft: await db.get("drafts", id),
    recipe: await db.get("recipes", id),
  };
}

async function deleteLocalDB() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

beforeEach(async () => {
  await deleteLocalDB();
  vi.resetAllMocks();
  currentUser = owner;
  createClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: currentUser ? { id: currentUser } : null }, error: null }) } });
  enqueueUrlJob.mockImplementation(async (_url, id) => job(id));
  enqueueImageJob.mockImplementation(async (_file, _kind, id) => job(id));
  enqueueTextJob.mockImplementation(async (_text, _kind, id) => job(id));
  getJob.mockImplementation(async (id) => job(id));
  retryJob.mockImplementation(async (id) => job(id));
  ackJob.mockImplementation(async (id) => job(id, "done"));
  const randomUUID = vi.fn().mockReturnValueOnce(jobId).mockReturnValue(replacementId);
  vi.stubGlobal("crypto", { randomUUID });
  vi.stubGlobal("navigator", { onLine: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(async () => {
  await deleteLocalDB();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("durable local recipe imports", () => {
  it("persists the UUID and request before offline submission, then resumes after reopening", async () => {
    const image = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal("navigator", { onLine: false });
    const queued = await queueLocalImport({ kind: "screenshot", upload: image, owner_id: owner });
    expect(queued.id).toBe(jobId);
    await flushLocalImports();
    expect(enqueueImageJob).not.toHaveBeenCalled();
    expect((await records()).import?.upload).toBeInstanceOf(Blob);

    await closeLocalDB();
    vi.stubGlobal("navigator", { onLine: true });
    await flushLocalImports();
    expect(enqueueImageJob).toHaveBeenCalledWith(expect.any(File), "screenshot", jobId, owner);
    expect((await records()).import).toMatchObject({ state: "submitted", upload: null });
  });

  it("keeps media until server confirmation and retries the same UUID", async () => {
    await queueLocalImport({ kind: "screenshot", upload: new Blob(["png"], { type: "image/png" }), owner_id: owner });
    enqueueImageJob.mockRejectedValueOnce(new Error("network lost"));
    await flushLocalImports();
    expect((await records()).import).toMatchObject({ state: "queued", upload: expect.any(Blob) });
    await flushLocalImports();
    expect(enqueueImageJob).toHaveBeenNthCalledWith(2, expect.any(File), "screenshot", jobId, owner);
    expect((await records()).import?.upload).toBeNull();
  });

  it("rejects unsupported screenshots before persisting a queue that would retry forever", async () => {
    await expect(queueLocalImport({ kind: "screenshot", upload: new Blob(["gif"], { type: "image/gif" }), owner_id: owner }))
      .rejects.toThrow("JPEG, PNG, or WebP");
    expect((await records()).import).toBeUndefined();
  });

  it("does not submit another owner's queue or operate after sign-in expires", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast bread", owner_id: owner });
    currentUser = other;
    await flushLocalImports();
    expect(enqueueTextJob).not.toHaveBeenCalled();
    currentUser = null;
    await flushLocalImports();
    expect((await records()).import).toMatchObject({ state: "queued", payload_text: "Toast bread" });
    currentUser = owner;
    await flushLocalImports();
    expect(enqueueTextJob).toHaveBeenCalledWith("Toast bread", "text", jobId, owner);
  });

  it("does not fetch jobs when hidden and records expired results for retry", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await flushLocalImports();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await flushLocalImports();
    expect(getJob).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    getJob.mockRejectedValueOnce(new Error("Import expired; submit again"));
    await flushLocalImports();
    expect((await records()).import).toMatchObject({ state: "error", error: "Import expired; submit again", source_url: "https://example.com/toast" });
    const replacement = await retryLocalImport(jobId);
    expect(replacement.id).not.toBe(jobId);
    expect(replacement).toMatchObject({ state: "queued", source_url: "https://example.com/toast" });
  });

  it("retries a remote error by owner RPC while retaining its original ID", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });
    await flushLocalImports();
    expect((await records()).import).toMatchObject({ state: "error", error: "Parser unavailable" });
    expect(await retryLocalImport(jobId)).toMatchObject({ id: jobId, state: "submitted", error: null });
    expect(retryJob).toHaveBeenCalledWith(jobId);
  });

  it("keeps the original ID when the retry RPC succeeds but the local update aborts", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });
    await flushLocalImports();
    const db = await getLocalDB();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((storeNames, mode, options) => {
      const tx = transaction(storeNames, mode, options);
      const store = tx.objectStore("imports") as IDBPObjectStore<
        LocalDBSchema, ["imports"], "imports", "readwrite"
      >;
      const put = store.put.bind(store);
      vi.spyOn(store, "put").mockImplementation(async (...args) => {
        const key = await put(...args);
        void tx.done.catch(() => undefined);
        tx.abort();
        return key;
      });
      return tx;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(retryLocalImport(jobId)).rejects.toThrow();
    expect(retryJob).toHaveBeenCalledTimes(1);
    expect((await records()).import).toMatchObject({ id: jobId, state: "error" });
    expect(await (await getLocalDB()).getAll("imports")).toHaveLength(1);

    vi.restoreAllMocks();
    retryJob.mockRejectedValueOnce(new Error("import cannot be retried"));
    getJob.mockResolvedValueOnce(job(jobId, "pending"));
    expect(await retryLocalImport(jobId)).toMatchObject({ id: jobId, state: "submitted" });
    expect(retryJob).toHaveBeenCalledTimes(2);
    expect(await (await getLocalDB()).getAll("imports")).toHaveLength(1);
  });

  it("reconciles a lost retry RPC response before deciding whether a new job is needed", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });
    await flushLocalImports();
    retryJob.mockRejectedValueOnce(new Error("response lost"));
    getJob.mockResolvedValueOnce(job(jobId, "processing"));

    expect(await retryLocalImport(jobId)).toMatchObject({ id: jobId, state: "submitted" });
    expect(await (await getLocalDB()).getAll("imports")).toHaveLength(1);
  });

  it("creates a replacement only for a confirmed exhausted remote error", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });
    await flushLocalImports();
    retryJob.mockRejectedValueOnce(new Error("import cannot be retried"));
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), attempts: 3, error: "Parser unavailable" });

    expect(await retryLocalImport(jobId)).toMatchObject({ id: replacementId, state: "queued" });
    expect((await records()).import).toMatchObject({ state: "replaced", replacement_id: replacementId });
  });

  it("keeps a retryable remote error when the retry RPC fails transiently", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });
    await flushLocalImports();
    retryJob.mockRejectedValueOnce(new Error("network lost"));
    getJob.mockResolvedValueOnce({ ...job(jobId, "error"), error: "Parser unavailable" });

    await expect(retryLocalImport(jobId)).rejects.toThrow("network lost");
    expect((await records()).import).toMatchObject({ state: "error" });
    expect((await records()).import?.replacement_id).toBeUndefined();
    expect(await (await getLocalDB()).getAll("imports")).toHaveLength(1);
  });

  it("links an expired retry once across concurrent calls and later reopen", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await flushLocalImports();
    getJob.mockRejectedValueOnce(new Error("Import expired; submit again"));
    await flushLocalImports();

    const [first, second] = await Promise.all([retryLocalImport(jobId), retryLocalImport(jobId)]);
    expect(first.id).toBe(replacementId);
    expect(second.id).toBe(first.id);
    expect((await records()).import).toMatchObject({ state: "replaced", replacement_id: replacementId });
    expect(await (await getLocalDB()).getAll("imports")).toHaveLength(2);

    await closeLocalDB();
    expect((await retryLocalImport(jobId)).id).toBe(replacementId);
    await flushLocalImports();
    expect(enqueueUrlJob).toHaveBeenCalledTimes(2);
    expect(enqueueUrlJob).toHaveBeenNthCalledWith(2, "https://example.com/toast", replacementId, owner);
  });

  it("asks for media reselection if an expired screenshot has already uploaded", async () => {
    await queueLocalImport({ kind: "screenshot", upload: new Blob(["png"], { type: "image/png" }), owner_id: owner });
    await flushLocalImports();
    getJob.mockRejectedValueOnce(new Error("Import expired; submit again"));
    await flushLocalImports();
    await expect(retryLocalImport(jobId)).rejects.toThrow("Select the screenshot again");
    expect((await records()).import).toMatchObject({ state: "error", upload: null });
  });

  it("commits a validated draft before acknowledgement without saving a recipe", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await receiveImportDraft(job(jobId, "done"));
    expect((await records()).draft).toMatchObject({ id: jobId, warnings: ["Check servings"] });
    expect((await records()).recipe).toBeUndefined();
    expect(ackJob).toHaveBeenCalledWith(jobId);
    expect((await records()).import).toMatchObject({ state: "draft", acknowledged: true });
  });

  it("rejects malformed remote output before writing or acknowledging", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    const malformed = { ...job(jobId, "done"), result_recipe_json: { ...recipeFixture(), id: "wrong" } };
    await expect(receiveImportDraft(malformed)).rejects.toThrow();
    expect((await records()).draft).toBeUndefined();
    expect(ackJob).not.toHaveBeenCalled();
  });

  it("does not acknowledge when a write inside the draft transaction aborts", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    const db = await getLocalDB();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((storeNames, mode, options) => {
      const tx = transaction(storeNames, mode, options);
      const store = tx.objectStore("drafts") as IDBPObjectStore<
        LocalDBSchema, ["imports", "drafts", "recipes"], "drafts", "readwrite"
      >;
      const put = store.put.bind(store);
      vi.spyOn(store, "put").mockImplementation(async (...args) => {
        const key = await put(...args);
        void tx.done.catch(() => undefined);
        tx.abort();
        return key;
      });
      return tx;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(receiveImportDraft(job(jobId, "done"))).rejects.toThrow();
    expect(ackJob).not.toHaveBeenCalled();
    expect((await records()).draft).toBeUndefined();
    consoleError.mockRestore();
  });

  it("preserves an edited draft on duplicate delivery and retries failed acknowledgement", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    ackJob.mockRejectedValueOnce(new Error("network lost"));
    await receiveImportDraft(job(jobId, "done"));
    expect((await records()).import?.acknowledged).toBe(false);
    const db = await getLocalDB();
    const draft = (await records()).draft!;
    await db.put("drafts", { ...draft, recipe: { ...draft.recipe, title: "My toast" } });
    await receiveImportDraft(job(jobId, "done"));
    expect((await records()).draft?.recipe.title).toBe("My toast");
    expect((await records()).import?.acknowledged).toBe(true);
  });

  it("persists review edits and duplicate delivery keeps them", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    await receiveImportDraft(job(jobId, "done"));
    await updateImportDraft(jobId, { ...recipeFixture(), title: "My toast" });
    await closeLocalDB();
    await receiveImportDraft(job(jobId, "done"));
    expect((await records()).draft?.recipe.title).toBe("My toast");
    expect((await records()).recipe).toBeUndefined();
  });

  it("replaces a screenshot needing reselection in one local commit", async () => {
    await queueLocalImport({ kind: "screenshot", upload: new Blob(["png"], { type: "image/png" }), owner_id: owner });
    await flushLocalImports();
    getJob.mockRejectedValueOnce(new Error("Import expired; submit again"));
    await flushLocalImports();
    const next = await reselectScreenshotImport(jobId, new Blob(["again"], { type: "image/png" }));
    expect(next).toMatchObject({ id: replacementId, state: "queued", owner_id: owner, upload: expect.any(Blob) });
    expect((await records()).import).toMatchObject({ state: "replaced", replacement_id: replacementId });
    await closeLocalDB();
    await flushLocalImports();
    expect(enqueueImageJob).toHaveBeenCalledTimes(2);
    expect(enqueueImageJob).toHaveBeenNthCalledWith(2, expect.any(File), "screenshot", replacementId, owner);
  });

  it("keeps Save committed while a prior acknowledgement RPC is pending", async () => {
    await queueLocalImport({ kind: "url", source_url: "https://example.com/toast", owner_id: owner });
    let finishAck!: () => void;
    let ackStarted!: () => void;
    const started = new Promise<void>((resolve) => { ackStarted = resolve; });
    ackJob.mockImplementationOnce(async () => {
      ackStarted();
      await new Promise<void>((resolve) => { finishAck = resolve; });
      return job(jobId, "done");
    });

    const delivery = receiveImportDraft(job(jobId, "done"));
    await started;
    await acceptDraft(jobId, recipeFixture());
    finishAck();
    await delivery;

    expect((await records())).toMatchObject({ draft: undefined, import: { state: "saved", acknowledged: true } });
    expect((await records()).recipe).toBeDefined();
  });

  it("saves edited recipe and clears draft atomically; repeated Save preserves later edits", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    await receiveImportDraft(job(jobId, "done"));
    const saved = await acceptDraft(jobId, { ...recipeFixture(), id: "ignored", title: "Edited toast" });
    expect(saved).toMatchObject({ id: jobId, title: "Edited toast" });
    expect((await records())).toMatchObject({ draft: undefined, recipe: saved, import: { state: "saved" } });
    await (await getLocalDB()).put("recipes", { ...saved, title: "Edited again" });
    expect((await acceptDraft(jobId, recipeFixture())).title).toBe("Edited again");
  });

  it("rolls back a failed Save without losing the draft", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    await receiveImportDraft(job(jobId, "done"));
    const db = await getLocalDB();
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementation((storeNames, mode, options) => {
      const tx = transaction(storeNames, mode, options);
      const store = tx.objectStore("recipes") as IDBPObjectStore<
        LocalDBSchema, ["recipes", "drafts", "imports"], "recipes", "readwrite"
      >;
      const put = store.put.bind(store);
      vi.spyOn(store, "put").mockImplementation(async (...args) => {
        const key = await put(...args);
        void tx.done.catch(() => undefined);
        tx.abort();
        return key;
      });
      return tx;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(acceptDraft(jobId, recipeFixture())).rejects.toThrow();
    expect((await records())).toMatchObject({ recipe: undefined, import: { state: "draft" } });
    expect((await records()).draft).toBeDefined();
    consoleError.mockRestore();
  });

  it("acknowledges a saved recipe on later flush after earlier acknowledgement failed", async () => {
    await queueLocalImport({ kind: "text", payload_text: "Toast", owner_id: owner });
    ackJob.mockRejectedValueOnce(new Error("network lost"));
    await receiveImportDraft(job(jobId, "done"));
    await acceptDraft(jobId, recipeFixture());
    await flushLocalImports();
    expect((await records()).import).toMatchObject({ state: "saved", acknowledged: true });
    expect(ackJob).toHaveBeenCalledTimes(2);
  });
});
