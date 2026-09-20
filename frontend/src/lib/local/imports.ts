import { ackJob, enqueueImageJob, enqueueTextJob, enqueueUrlJob, getJob, retryJob, type ParseJob } from "@/lib/db/parseJobs";
import { importDraftFromJob } from "@/lib/import-schema";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { createClient } from "@/lib/supabase/client";
import { closeLocalDB, getLocalDB, reportStorageIssue } from "./db";
import { notifyChange } from "./repository";
import { LocalImportSchema, type LocalImport } from "./schema";

export type LocalImportInput = Pick<LocalImport, "kind"> & Partial<Pick<LocalImport,
  "owner_id" | "source_url" | "payload_text" | "upload">>;

/** The caller may supply its known signed-in owner even while offline. An unbound item binds on first online flush. */
export async function queueLocalImport(input: LocalImportInput): Promise<LocalImport> {
  const record = LocalImportSchema.parse({
    id: crypto.randomUUID(), owner_id: input.owner_id ?? null, kind: input.kind,
    source_url: input.source_url ?? null, payload_text: input.payload_text ?? null,
    upload: input.upload ?? null, state: "queued", acknowledged: false,
    error: null, created_at: new Date().toISOString(),
  });
  if (record.kind === "screenshot" && !record.upload) throw new Error("Select a screenshot to import");
  if (record.kind === "screenshot" && record.upload &&
      !["image/jpeg", "image/png", "image/webp"].includes(record.upload.type))
    throw new Error("Upload a JPEG, PNG, or WebP image");
  if (record.kind === "screenshot" && record.upload && record.upload.size > 10 * 1024 * 1024)
    throw new Error("Image exceeds 10 MB");
  if ((record.kind === "url" || record.kind === "video") && !record.source_url)
    throw new Error("Enter a recipe URL");
  if (record.kind === "text" && !record.payload_text?.trim()) throw new Error("Enter recipe text");
  await writeLocal("Unable to queue import locally.", async () => {
    const db = await getLocalDB();
    await db.put("imports", record);
  });
  notifyChange();
  return record;
}

export async function listLocalImports(): Promise<LocalImport[]> {
  const db = await getLocalDB();
  return LocalImportSchema.array().parse(await db.getAll("imports"));
}

/** A foreground caller owns the timer (five seconds) and stops it on hidden/offline. */
export function canSyncLocalImports(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine &&
    (typeof document === "undefined" || document.visibilityState === "visible");
}

async function signedInOwner(): Promise<string | null> {
  try {
    const { data, error } = await createClient().auth.getUser();
    return error ? null : data.user?.id ?? null;
  } catch {
    return null; // An expired session or unavailable Auth pauses remote work, never local editing.
  }
}

async function writeLocal<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    await closeLocalDB();
    reportStorageIssue(message, error);
    throw error;
  }
}

async function replaceImport(record: LocalImport): Promise<void> {
  await writeLocal("Unable to update local import.", async () => {
    const db = await getLocalDB();
    await db.put("imports", LocalImportSchema.parse(record));
  });
  notifyChange();
}

async function acknowledge(record: LocalImport): Promise<void> {
  if (record.acknowledged || !canSyncLocalImports()) return;
  try {
    await ackJob(record.id);
  } catch {
    return; // The draft is durable; next visible flush retries the owner-checked RPC.
  }
  // The RPC is idempotent; if this write fails, the next flush repeats it.
  await replaceImport({ ...record, acknowledged: true });
}

/** A done result is a draft only. Duplicate delivery never replaces local review edits. */
export async function receiveImportDraft(job: ParseJob): Promise<void> {
  const draft = importDraftFromJob(job);
  const owner = await signedInOwner();
  if (!owner) return;
  const record = await writeLocal("Unable to save import draft locally.", async () => {
    const db = await getLocalDB();
    const tx = db.transaction(["imports", "drafts", "recipes"], "readwrite");
    const committed = tx.done;
    void committed.catch(() => undefined);
    const imports = tx.objectStore("imports");
    const existing = await imports.get(draft.id);
    if (!existing || existing.owner_id !== owner) {
      tx.abort();
      throw new Error("Import is not owned by this account");
    }
    // Save wins even if an old job result arrives after an explicit Save.
    if (existing.state !== "saved" && !(await tx.objectStore("recipes").get(draft.id))) {
      if (!(await tx.objectStore("drafts").get(draft.id))) {
        await tx.objectStore("drafts").put(draft);
      }
      await imports.put({ ...existing, state: "draft", error: null });
    }
    await committed;
    return existing.state === "saved" ? existing : { ...existing, state: "draft" as const, error: null };
  });
  notifyChange();
  await acknowledge(record);
}

let activeFlush: Promise<void> | undefined;

/** Call on mount, online/focus/visibility changes, and every five seconds while outstanding. */
export function flushLocalImports(): Promise<void> {
  if (!canSyncLocalImports()) return Promise.resolve();
  if (activeFlush) return activeFlush;
  activeFlush = flushPending().finally(() => { activeFlush = undefined; });
  return activeFlush;
}

async function flushPending(): Promise<void> {
  const owner = await signedInOwner();
  if (!owner || !canSyncLocalImports()) return;
  for (const record of await listLocalImports()) {
    if (!canSyncLocalImports()) return;
    if (record.owner_id && record.owner_id !== owner) continue;
    if (record.state === "saved") {
      await acknowledge(record);
      continue;
    }
    if (record.state === "draft") {
      await acknowledge(record);
      continue;
    }
    if (record.state === "error") continue; // User must explicitly retry.
    let current = record;
    if (!current.owner_id) {
      current = { ...current, owner_id: owner };
      await replaceImport(current); // Durable owner binding before any remote submission.
    }
    if (current.state === "queued") {
      try {
        const remote = current.kind === "screenshot"
          ? await enqueueImageJob(new File([current.upload!], `${current.id}.png`, { type: current.upload!.type }), "screenshot", current.id, owner)
          : current.kind === "text"
            ? await enqueueTextJob(current.payload_text!, "text", current.id, owner)
            : await enqueueUrlJob(current.source_url!, current.id, owner);
        current = { ...current, state: "submitted", upload: null, error: null };
        await replaceImport(current); // Keep the Blob until the row itself is confirmed.
        if (remote.status === "done") await receiveImportDraft(remote);
        if (remote.status === "error") await markRemoteError(current, remote.error ?? "Import failed");
      } catch (error) {
        // A remote insert may have succeeded. Preserve the UUID and Blob to repeat idempotently.
        if (current.state === "queued") await replaceImport({ ...current, error: String(error) });
      }
      continue;
    }
    try {
      const remote = await getJob(current.id);
      if (remote.status === "done") await receiveImportDraft(remote);
      if (remote.status === "error") await markRemoteError(current, remote.error ?? "Import failed");
    } catch (error) {
      if (error instanceof Error && error.message === "Import expired; submit again") {
        await markRemoteError(current, error.message);
      }
      // Transient network/Auth failures leave submitted requests intact.
    }
  }
}

async function markRemoteError(record: LocalImport, error: string): Promise<void> {
  await replaceImport({ ...record, state: "error", error });
}

/** Retry the owner RPC where possible; an expired result gets a fresh durable UUID. */
export async function retryLocalImport(id: string): Promise<LocalImport> {
  const db = await getLocalDB();
  const record = LocalImportSchema.parse(await db.get("imports", id));
  if (record.state !== "error") throw new Error("Import is not waiting for retry");
  const owner = await signedInOwner();
  if (!canSyncLocalImports() || !owner || record.owner_id !== owner)
    throw new Error("Sign in to retry this import");
  if (record.error !== "Import expired; submit again") {
    try {
      await retryJob(id);
      const retried = { ...record, state: "submitted" as const, error: null };
      await replaceImport(retried);
      return retried;
    } catch {
      // An exhausted/missing remote row needs a new UUID, if its source remains.
    }
  }
  if (record.kind === "screenshot" && !record.upload)
    throw new Error("Select the screenshot again to retry this import");
  return queueLocalImport({ kind: record.kind, owner_id: record.owner_id,
    source_url: record.source_url, payload_text: record.payload_text, upload: record.upload });
}

/** One IndexedDB transaction makes explicit Save idempotent across taps and tabs. */
export async function acceptDraft(jobId: string, editedRecipe: Recipe): Promise<Recipe> {
  const recipe = RecipeSchema.parse({ ...editedRecipe, id: jobId });
  const saved = await writeLocal("Unable to save imported recipe locally.", async () => {
    const db = await getLocalDB();
    const tx = db.transaction(["recipes", "drafts", "imports"], "readwrite");
    const committed = tx.done;
    void committed.catch(() => undefined);
    const recipes = tx.objectStore("recipes");
    const existing = await recipes.get(jobId);
    if (existing) {
      await committed;
      return existing;
    }
    const draft = await tx.objectStore("drafts").get(jobId);
    const imported = await tx.objectStore("imports").get(jobId);
    if (!draft || !imported) {
      tx.abort();
      throw new Error("Import draft is unavailable");
    }
    await recipes.put(recipe);
    await tx.objectStore("drafts").delete(jobId);
    await tx.objectStore("imports").put({ ...imported, state: "saved", upload: null });
    await committed;
    return recipe;
  });
  notifyChange();
  return saved;
}
