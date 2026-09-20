// Client-safe data-access layer for the import parse queue.
//
// Unlike `lib/db/recipes.ts` (server-only, cookie-bound), these helpers run in
// the browser via `@/lib/supabase/client`. That matters for two reasons:
//   1. Row-level security scopes every `parse_jobs` read/write to the signed-in
//      user (the `user_id = auth.uid()` owner policy).
//   2. Storage uploads to the private `imports` bucket bind `owner` to the same
//      user, so the owner-only object RLS is satisfied.
//
// The client only ever sends the minimal columns for a job (`kind` +
// `source_url` / `storage_path` / `payload_text`). `user_id`, `status`
// (`pending`), `attempts` (0), and the timestamps all default server-side.

import { createClient } from "@/lib/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────────

export type ParseJobKind =
  | "url"
  | "text"
  | "screenshot"
  | "video"
  | "shopping_list"
  | "receipt";

export type ParseJobStatus = "pending" | "processing" | "done" | "error";

/** Mirrors the `parse_jobs` table columns (migrations 0001 + 0003). */
export interface ParseJob {
  id: string;
  kind: ParseJobKind;
  source_url: string | null;
  storage_path: string | null;
  payload_text: string | null;
  status: ParseJobStatus;
  attempts: number;
  error: string | null;
  result_recipe_id: string | null;
  result_recipe_json: unknown | null;
  result_warnings: string[];
  lease_until: string | null;
  claim_token: string | null;
  acknowledged_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const TABLE = "parse_jobs";
const BUCKET = "imports";

// Ported from the inline route's `VIDEO_URL_HOST_RE` (and `lib/api.ts`): a URL
// whose host is TikTok/Instagram is a `video` job; anything else is a `url` job.
const VIDEO_URL_HOST_RE =
  /(^|\.)((tiktok\.com)|(vm\.tiktok\.com)|(instagram\.com)|(instagr\.am))$/i;

/** Classify a raw URL into a `parse_jobs.kind` of `"video"` or `"url"`. */
export function classifyUrlKind(url: string): "video" | "url" {
  try {
    return VIDEO_URL_HOST_RE.test(new URL(url).hostname) ? "video" : "url";
  } catch {
    return "url";
  }
}

// ── Enqueue helpers ──────────────────────────────────────────────────────────

/**
 * Enqueue a link import. Hosts matching the TikTok/Instagram regex enqueue a
 * `video` job; everything else enqueues a `url` job. Sends only `kind` +
 * `source_url`; the rest of the row defaults server-side.
 */
export async function enqueueUrlJob(url: string, id = crypto.randomUUID()): Promise<ParseJob> {
  const supabase = createClient();
  const kind = classifyUrlKind(url);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ id, kind, source_url: url })
    .select("*")
    .single();

  if (error?.code === "23505") return getJob(id);
  if (error) throw new Error(`Failed to enqueue URL job: ${error.message}`);
  return data as ParseJob;
}

const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensionFor(file: File): string {
  const byType = EXT_BY_MEDIA_TYPE[file.type];
  if (byType) return byType;
  const dot = file.name.lastIndexOf(".");
  if (dot > -1 && dot < file.name.length - 1) {
    return file.name.slice(dot + 1).toLowerCase();
  }
  return "bin";
}

/**
 * Upload an image to `imports/${userId}/${uuid}.${ext}` and enqueue a job that
 * points at it via `storage_path`. Used for `screenshot` and `receipt` kinds
 * (and shopping-list *photos*, which the caller passes as `screenshot`).
 */
export async function enqueueImageJob(
  file: File,
  kind: "screenshot" | "receipt",
  id = crypto.randomUUID()
): Promise<ParseJob> {
  if (!Object.hasOwn(EXT_BY_MEDIA_TYPE, file.type)) {
    throw new Error("Upload a JPEG, PNG, or WebP image");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Image exceeds 10 MB");
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(`Not signed in: ${authError.message}`);
  if (!user) throw new Error("Not signed in");

  const path = `${user.id}/${id}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message))
    throw new Error(`Failed to upload image: ${uploadError.message}`);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ id, kind, storage_path: path })
    .select("*")
    .single();

  if (error?.code === "23505") return getJob(id);
  if (error) throw new Error(`Failed to enqueue image job: ${error.message}`);
  return data as ParseJob;
}

/**
 * Enqueue a pasted-text shopping list. The text lives in `payload_text`
 * (migration 0003); no Storage object is created.
 */
export async function enqueueTextJob(
  text: string,
  kind: "text" | "shopping_list",
  id = crypto.randomUUID()
): Promise<ParseJob> {
  if (!text.trim() || text.length > 50_000) throw new Error("Text must be 1–50,000 characters");
  const supabase = createClient();

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ id, kind, payload_text: text })
    .select("*")
    .single();

  if (error?.code === "23505") return getJob(id);
  if (error) throw new Error(`Failed to enqueue text job: ${error.message}`);
  return data as ParseJob;
}

// ── Read / subscribe ─────────────────────────────────────────────────────────

/** All of the current user's parse jobs, newest first. */
export async function listJobs(): Promise<ParseJob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list parse jobs: ${error.message}`);
  return (data ?? []) as ParseJob[];
}

/** Fetch a submitted job by its durable local ID. A missing row has expired. */
export async function getJob(id: string): Promise<ParseJob> {
  const { data, error } = await createClient().from(TABLE).select("*").eq("id", id).single();
  if (error?.code === "PGRST116") throw new Error("Import expired; submit again");
  if (error) throw new Error(`Failed to fetch import job: ${error.message}`);
  if (!data) throw new Error("Import expired; submit again");
  return data as ParseJob;
}

/**
 * Retry a failed owned job through the checked RPC. Attempts remain capped at 3.
 */
export async function retryJob(id: string): Promise<ParseJob> {
  const { data, error } = await createClient().rpc("retry_import_job", { p_id: id });

  if (error) throw new Error(`Failed to retry job: ${error.message}`);
  return data as ParseJob;
}

/** Called only after the draft is durably committed in IndexedDB. */
export async function ackJob(id: string): Promise<ParseJob> {
  const { data, error } = await createClient().rpc("ack_import_job", { p_id: id });
  if (error) throw new Error(`Failed to acknowledge import: ${error.message}`);
  return data as ParseJob;
}

/**
 * Live-update parse jobs via Supabase Realtime. Fires `onChange` on any
 * INSERT/UPDATE/DELETE to `parse_jobs` (RLS scopes the stream to the user's own
 * rows). Returns an unsubscribe function.
 *
 * If Realtime isn't enabled on the project, callers can fall back to
 * `pollJobs`.
 */
export function subscribeJobs(onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel("parse_jobs_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Poll fallback for environments without Realtime. Invokes `onChange` every
 * `ms` milliseconds. Returns a function that clears the interval.
 */
export function pollJobs(onChange: () => void, ms = 4000): () => void {
  const handle = setInterval(onChange, ms);
  return () => clearInterval(handle);
}
