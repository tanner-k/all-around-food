import { ackJob, enqueueImageJob, enqueueTextJob, enqueueUrlJob, getJob, listImportJobs, ImportQueueJobSchema, retryJob, type ImportQueueJob, type ParseJob } from "@/lib/db/parseJobs";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { createClient } from "@/lib/supabase/client";
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, isCurrentLocalAccount, reportAccountStorageFailure, type LocalAccount } from "./db";
import { enqueueSyncGroup } from "./sync-state";
import { notifyChange } from "./repository";
import { LocalImportSchema, type LocalImport } from "./schema";

export type LocalImportInput = Pick<LocalImport, "kind"> & Partial<Pick<LocalImport,
  "owner_id" | "source_url" | "payload_text" | "upload">>;

function validateScreenshot(upload: Blob): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(upload.type))
    throw new Error("Upload a JPEG, PNG, or WebP image");
  if (upload.size > 10 * 1024 * 1024) throw new Error("Image exceeds 10 MB");
}

/** Queue only in the captured namespace; a legacy owner hint never grants account access. */
export async function queueLocalImport(input: LocalImportInput, account = captureLocalAccount()): Promise<LocalImport> {
  const record = LocalImportSchema.parse({
    id: crypto.randomUUID(), owner_id: account.ownerId, kind: input.kind,
    source_url: input.source_url ?? null, payload_text: input.payload_text ?? null,
    upload: input.upload ?? null, state: "queued", acknowledged: false,
    error: null, created_at: new Date().toISOString(),
  });
  if (record.kind === "screenshot" && !record.upload) throw new Error("Select a screenshot to import");
  if (record.kind === "screenshot" && record.upload) validateScreenshot(record.upload);
  if ((record.kind === "url" || record.kind === "video") && !record.source_url)
    throw new Error("Enter a recipe URL");
  if (record.kind === "text" && !record.payload_text?.trim()) throw new Error("Enter recipe text");
  await writeLocal(account, "Unable to queue import locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    await db.put("imports", record);
  });
  notifyChange(account);
  return record;
}

export async function listLocalImports(account = captureLocalAccount()): Promise<LocalImport[]> {
  const db = await getLocalDB(account);
  assertCurrentLocalAccount(account);
  const records = await db.getAll("imports");
  assertCurrentLocalAccount(account);
  return LocalImportSchema.array().parse(records);
}

/** Persist each review edit; a late edit cannot recreate a draft after Save. */
export async function updateImportDraft(jobId: string, editedRecipe: Recipe, account = captureLocalAccount()): Promise<void> {
  const recipe = RecipeSchema.parse({ ...editedRecipe, id: jobId });
  const changed = await writeLocal(account, "Unable to save import review edits locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["drafts", "sync_outbox", "sync_shadow"], "readwrite");
    const draft = await tx.objectStore("drafts").get(jobId);
    if (draft) {
      const next = { ...draft, recipe };
      await tx.objectStore("drafts").put(next);
      if (account.ownerId) await enqueueSyncGroup(tx, [{ kind: "draft", entity_id: jobId, payload: next, deleted: false }]);
    }
    await tx.done;
    return Boolean(draft);
  });
  if (changed) notifyChange(account);
}

/** Retire the expired screenshot and queue its replacement atomically. */
export async function reselectScreenshotImport(id: string, upload: Blob, account = captureLocalAccount()): Promise<LocalImport> {
  validateScreenshot(upload);
  const next = await writeLocal(account, "Unable to queue replacement screenshot locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("imports", "readwrite");
    const committed = tx.done;
    void committed.catch(() => undefined);
    const current = LocalImportSchema.parse(await tx.store.get(id));
    if (current.state === "replaced" && current.replacement_id) {
      const replacement = LocalImportSchema.parse(await tx.store.get(current.replacement_id));
      await committed;
      return replacement;
    }
    if (current.kind !== "screenshot" || current.state !== "error") {
      tx.abort();
      throw new Error("Screenshot is not waiting for reselection");
    }
    const replacement = LocalImportSchema.parse({ ...current, id: crypto.randomUUID(),
      state: "queued", upload, error: null, acknowledged: false,
      replacement_id: null, created_at: new Date().toISOString() });
    await tx.store.add(replacement);
    await tx.store.put({ ...current, state: "replaced", replacement_id: replacement.id });
    await committed;
    return replacement;
  });
  notifyChange(account);
  return next;
}

/** A foreground caller owns the timer (five seconds) and stops it on hidden/offline. */
export function canSyncLocalImports(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine &&
    (typeof document === "undefined" || document.visibilityState === "visible");
}

async function signedInOwner(account: LocalAccount): Promise<string | null> {
  if (!account.ownerId || !isCurrentLocalAccount(account)) return null;
  try {
    const { data, error } = await createClient().auth.getUser();
    return !error && isCurrentLocalAccount(account) && data.user?.id === account.ownerId ? account.ownerId : null;
  } catch {
    return null; // An expired session or unavailable Auth pauses remote work, never local editing.
  }
}

async function writeLocal<T>(account: LocalAccount, message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    await reportAccountStorageFailure(account, message, error);
    throw error;
  }
}

async function replaceImport(record: LocalImport, account: LocalAccount): Promise<void> {
  await writeLocal(account, "Unable to update local import.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    await db.put("imports", LocalImportSchema.parse(record));
  });
  notifyChange(account);
}

async function acknowledge(record: LocalImport, account: LocalAccount): Promise<void> {
  if (!isCurrentLocalAccount(account)) return;
  if (record.acknowledged || !canSyncLocalImports()) return;
  try {
    await ackJob(record.id);
    if (!isCurrentLocalAccount(account)) return;
  } catch {
    return; // The draft is durable; next visible flush retries the owner-checked RPC.
  }
  // The RPC is idempotent; if this write fails, the next flush repeats it.
  await writeLocal(account, "Unable to update local import.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("imports", "readwrite");
    const current = await tx.store.get(record.id);
    if (current && !current.acknowledged) await tx.store.put({ ...current, acknowledged: true });
    await tx.done;
  });
  notifyChange(account);
}

/** Reconcile queue state only. Draft content and its base revision arrive through library sync. */
async function receiveQueueMetadata(jobs: ImportQueueJob[], account: LocalAccount): Promise<void> {
  const records = ImportQueueJobSchema.array().parse(jobs);
  const ready = await writeLocal(account, "Unable to save import queue locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["imports", "drafts", "recipes", "sync_shadow"], "readwrite");
    const ready: LocalImport[] = [];
    let changed = false;
    for (const job of records) {
      const current = await tx.objectStore("imports").get(job.id);
      if (current?.state === "replaced") continue;
      const recipe = await tx.objectStore("recipes").get(job.id);
      const draft = await tx.objectStore("drafts").get(job.id);
      const shadow = await tx.objectStore("sync_shadow").get(`draft:${job.id}`);
      const state = current?.state === "saved" || recipe || shadow?.deleted ? "saved"
        : draft && shadow ? "draft" : job.status === "error" ? "error" : "submitted";
      const next = LocalImportSchema.parse({
        id: job.id, owner_id: account.ownerId, kind: job.kind,
        source_url: current?.source_url ?? job.source_url, payload_text: current?.payload_text ?? null,
        upload: null, state, remote_status: job.status, acknowledged: Boolean(job.acknowledged_at) || current?.acknowledged === true,
        error: state === "error" ? job.error : null, created_at: current?.created_at ?? job.created_at,
      });
      if (JSON.stringify(current) !== JSON.stringify(next)) { await tx.objectStore("imports").put(next); changed = true; }
      if (job.status === "done" && shadow && (state === "draft" || state === "saved")) ready.push(next);
    }
    await tx.done;
    return { ready, changed };
  });
  assertCurrentLocalAccount(account);
  if (ready.changed) notifyChange(account);
  for (const record of ready.ready) {
    assertCurrentLocalAccount(account);
    await acknowledge(record, account);
  }
}

/** A late or duplicate parse result cannot create a draft or challenge its server revision. */
export async function receiveImportDraft(job: ParseJob, account = captureLocalAccount()): Promise<void> {
  if (job.status !== "done") throw new Error("Import is not done");
  const owner = await signedInOwner(account);
  if (!owner) return;
  assertCurrentLocalAccount(account);
  await receiveQueueMetadata([ImportQueueJobSchema.parse(job)], account);
}

const activeFlushes = new Map<string, Promise<void>>();

/** Call on mount, online/focus/visibility changes, and every five seconds while outstanding. */
export function flushLocalImports(account = captureLocalAccount()): Promise<void> {
  if (!account.ownerId || !isCurrentLocalAccount(account) || !canSyncLocalImports()) return Promise.resolve();
  const key = `${account.dbName}:${account.generation}`;
  const active = activeFlushes.get(key);
  if (active) return active;
  const task = flushPending(account).finally(() => { activeFlushes.delete(key); });
  activeFlushes.set(key, task);
  return task;
}

async function flushPending(account: LocalAccount): Promise<void> {
  const owner = await signedInOwner(account);
  if (!owner || !canSyncLocalImports()) return;
  const jobs = await listImportJobs(owner, () => assertCurrentLocalAccount(account));
  assertCurrentLocalAccount(account);
  if (!canSyncLocalImports()) return;
  await receiveQueueMetadata(jobs, account);
  for (const record of await listLocalImports(account)) {
    if (!isCurrentLocalAccount(account)) return;
    if (!canSyncLocalImports()) return;
    if (record.owner_id !== owner) continue;
    if (record.state === "saved") {
      await acknowledge(record, account);
      continue;
    }
    if (record.state === "draft") {
      await acknowledge(record, account);
      continue;
    }
    if (record.state === "error" || record.state === "replaced" || record.remote_status === "done") continue; // User must explicitly retry errors; replaced IDs are retired.
    let current = record;
    if (current.state === "queued") {
      try {
        const remote = current.kind === "screenshot"
          ? await enqueueImageJob(new File([current.upload!], `${current.id}.png`, { type: current.upload!.type }), "screenshot", current.id, owner, () => assertCurrentLocalAccount(account))
          : current.kind === "text"
            ? await enqueueTextJob(current.payload_text!, "text", current.id, owner, () => assertCurrentLocalAccount(account))
            : await enqueueUrlJob(current.source_url!, current.id, owner, () => assertCurrentLocalAccount(account));
        if (!isCurrentLocalAccount(account)) return;
        current = { ...current, state: "submitted", upload: null, error: null };
        await replaceImport(current, account); // Keep the Blob until the row itself is confirmed.
        if (remote.status === "done") await receiveImportDraft(remote, account);
        if (remote.status === "error") await markRemoteError(current, remote.error ?? "Import failed", account);
      } catch (error) {
        if (!isCurrentLocalAccount(account)) return;
        // A remote insert may have succeeded. Preserve the UUID and Blob to repeat idempotently.
        if (current.state === "queued") await replaceImport({ ...current, error: String(error) }, account);
      }
      continue;
    }
    try {
      const remote = await getJob(current.id);
      if (!isCurrentLocalAccount(account)) return;
      if (remote.status === "done") await receiveImportDraft(remote, account);
      if (remote.status === "error") await markRemoteError(current, remote.error ?? "Import failed", account);
    } catch (error) {
      if (!isCurrentLocalAccount(account)) return;
      if (error instanceof Error && error.message === "Import expired; submit again") {
        await markRemoteError(current, error.message, account);
      }
      // Transient network/Auth failures leave submitted requests intact.
    }
  }
}

async function markRemoteError(record: LocalImport, error: string, account: LocalAccount): Promise<void> {
  if (!isCurrentLocalAccount(account)) return;
  await replaceImport({ ...record, state: "error", error }, account);
}

/** Retry the owner RPC where possible; an expired result gets a fresh durable UUID. */
export async function retryLocalImport(id: string, account = captureLocalAccount()): Promise<LocalImport> {
  const db = await getLocalDB(account);
  assertCurrentLocalAccount(account);
  const record = LocalImportSchema.parse(await db.get("imports", id));
  assertCurrentLocalAccount(account);
  if (record.state === "replaced" && record.replacement_id) {
    const replacement = await db.get("imports", record.replacement_id);
    assertCurrentLocalAccount(account);
    return LocalImportSchema.parse(replacement);
  }
  if (record.state !== "error") throw new Error("Import is not waiting for retry");
  const owner = await signedInOwner(account);
  if (!canSyncLocalImports() || !owner || record.owner_id !== owner)
    throw new Error("Sign in to retry this import");
  if (record.error !== "Import expired; submit again") {
    let remote: ParseJob | undefined;
    let retryError: unknown;
    try {
      remote = await retryJob(id);
    } catch (error) {
      assertCurrentLocalAccount(account);
      retryError = error;
      try {
        remote = await getJob(id); // The RPC may have succeeded before its response was lost.
      } catch (lookupError) {
        if (!(lookupError instanceof Error && lookupError.message === "Import expired; submit again"))
          throw error;
      }
    }
    assertCurrentLocalAccount(account);
    if (remote?.status === "pending" || remote?.status === "processing")
      return markRetried(id, account);
    if (remote?.status === "done") {
      await receiveImportDraft(remote, account);
      const resultDB = await getLocalDB(account);
      assertCurrentLocalAccount(account);
      const result = await resultDB.get("imports", id);
      assertCurrentLocalAccount(account);
      return LocalImportSchema.parse(result);
    }
    if (remote?.status === "error" && remote.attempts < 3 && Date.parse(remote.expires_at) > Date.now())
      throw retryError ?? new Error("Import retry remains in error");
  }
  return replaceExpired(id, account);
}

async function markRetried(id: string, account: LocalAccount): Promise<LocalImport> {
  const updated = await writeLocal(account, "Unable to update local import.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("imports", "readwrite");
    const current = LocalImportSchema.parse(await tx.store.get(id));
    const next = current.state === "error"
      ? { ...current, state: "submitted" as const, error: null }
      : current;
    if (next !== current) await tx.store.put(next);
    await tx.done;
    return next;
  });
  notifyChange(account);
  return updated;
}

async function replaceExpired(id: string, account: LocalAccount): Promise<LocalImport> {
  const replacement = await writeLocal(account, "Unable to retry import locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction("imports", "readwrite");
    const committed = tx.done;
    void committed.catch(() => undefined);
    const current = LocalImportSchema.parse(await tx.store.get(id));
    if (current.state === "replaced" && current.replacement_id) {
      const existing = LocalImportSchema.parse(await tx.store.get(current.replacement_id));
      await committed;
      return existing;
    }
    if (current.state !== "error") {
      await committed;
      return current;
    }
    if (current.kind === "screenshot" && !current.upload) {
      tx.abort();
      throw new Error("Select the screenshot again to retry this import");
    }
    const next = LocalImportSchema.parse({ ...current, id: crypto.randomUUID(), state: "queued",
      acknowledged: false, error: null, replacement_id: null, created_at: new Date().toISOString() });
    await tx.store.add(next);
    await tx.store.put({ ...current, state: "replaced", replacement_id: next.id, upload: null });
    await committed;
    return next;
  });
  notifyChange(account);
  return replacement;
}

/** One IndexedDB transaction makes explicit Save idempotent across taps and tabs. */
export async function acceptDraft(jobId: string, editedRecipe: Recipe, account = captureLocalAccount()): Promise<Recipe> {
  const recipe = RecipeSchema.parse({ ...editedRecipe, id: jobId });
  const saved = await writeLocal(account, "Unable to save imported recipe locally.", async () => {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(["recipes", "drafts", "imports", "sync_outbox", "sync_shadow"], "readwrite");
    const committed = tx.done;
    void committed.catch(() => undefined);
    const recipes = tx.objectStore("recipes");
    const existing = await recipes.get(jobId);
    const draft = await tx.objectStore("drafts").get(jobId);
    const imported = await tx.objectStore("imports").get(jobId);
    if (!draft) {
      if (existing) { await committed; return existing; } // Repeated Save preserves later recipe edits.
      tx.abort();
      throw new Error("Import draft is unavailable");
    }
    if (account.ownerId && !(await tx.objectStore("sync_shadow").get(`draft:${jobId}`))) {
      const pending = await tx.objectStore("sync_outbox").getAll();
      if (!pending.some(group => group.changes.some(change => change.kind === "draft" && change.entity_id === jobId))) {
        await enqueueSyncGroup(tx, [{ kind: "draft", entity_id: jobId, payload: draft, deleted: false }]);
      }
    }
    await recipes.put(recipe);
    await tx.objectStore("drafts").delete(jobId);
    if (account.ownerId) await enqueueSyncGroup(tx, [
      { kind: "recipe", entity_id: recipe.id, payload: recipe, deleted: false },
      { kind: "draft", entity_id: jobId, payload: null, deleted: true },
    ]);
    // Backups keep drafts but not transient imports, so a restored draft has no
    // import row to close. Never invent one: that would fake a remote job.
    if (imported) {
      await tx.objectStore("imports").put({ ...imported, state: "saved", upload: null });
    }
    await committed;
    return recipe;
  });
  notifyChange(account);
  return saved;
}
