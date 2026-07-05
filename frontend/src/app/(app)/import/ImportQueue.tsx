"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listJobs,
  retryJob,
  subscribeJobs,
  pollJobs,
  type ParseJob,
  type ParseJobStatus,
} from "@/lib/db/parseJobs";

// Live view of the user's parse queue. Refreshes via Supabase Realtime with a
// poll fallback (in case Realtime isn't enabled on the project). Newest first,
// with a status badge, the source, a "View recipe" link once done, and a Retry
// action on failed rows.

const STATUS_LABEL: Record<ParseJobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  done: "Done",
  error: "Error",
};

const STATUS_CLASS: Record<ParseJobStatus, string> = {
  pending: "border-line text-ink-mute bg-paper-2",
  processing: "border-terra/40 text-terra bg-terra-soft",
  done: "border-line text-ink-soft bg-paper-2",
  error: "border-terra text-terra bg-terra-soft",
};

const KIND_LABEL: Record<ParseJob["kind"], string> = {
  url: "Link",
  video: "Video",
  screenshot: "Screenshot",
  receipt: "Receipt",
  shopping_list: "Shopping list",
};

function StatusBadge({ status }: { status: ParseJobStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
      ].join(" ")}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Human-readable source for a job: URL, uploaded file name, or pasted text. */
function jobSource(job: ParseJob): string {
  if (job.source_url) return job.source_url;
  if (job.storage_path) {
    const parts = job.storage_path.split("/");
    return parts[parts.length - 1] || job.storage_path;
  }
  if (job.payload_text) {
    const trimmed = job.payload_text.trim();
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  }
  return "—";
}

export function ImportQueue() {
  const [jobs, setJobs] = useState<ParseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listJobs();
      setJobs(rows);
    } catch (err) {
      console.error("[import-queue] failed to list jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (active) void refresh();
    };
    // Initial load, deferred out of the effect body so state updates land in a
    // later tick rather than synchronously during the effect.
    const initial = setTimeout(load, 0);
    // Prefer Realtime; also poll as a safety net so the queue stays fresh even
    // if Realtime isn't enabled on the project.
    const unsubscribe = subscribeJobs(load);
    const stopPolling = pollJobs(load);
    return () => {
      active = false;
      clearTimeout(initial);
      unsubscribe();
      stopPolling();
    };
  }, [refresh]);

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await retryJob(id);
      await refresh();
    } catch (err) {
      console.error("[import-queue] retry failed:", err);
      alert(`Failed to retry: ${String(err)}`);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <section className="mt-16">
      <h2 className="font-serif italic text-2xl text-ink mb-4">
        Import <em className="text-terra">queue</em>
      </h2>

      {loading ? (
        <p className="text-sm text-ink-mute">Loading queue…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-ink-mute">
          Nothing queued yet. Add a link or a screenshot above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-2xl bg-paper border border-line p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={job.status} />
                <span className="text-xs font-medium text-ink-soft uppercase tracking-wide">
                  {KIND_LABEL[job.kind]}
                </span>
                <span className="text-sm text-ink-mute break-all">
                  {jobSource(job)}
                </span>
              </div>

              {job.status === "error" && job.error && (
                <p className="text-sm text-terra break-words">{job.error}</p>
              )}

              <div className="flex items-center gap-3">
                {job.status === "done" && job.result_recipe_id && (
                  <Link
                    href={`/cookbook/${job.result_recipe_id}`}
                    className="text-terra font-medium hover:underline text-sm"
                  >
                    View recipe →
                  </Link>
                )}
                {job.status === "error" && (
                  <button
                    type="button"
                    onClick={() => void handleRetry(job.id)}
                    disabled={retrying === job.id}
                    className="rounded-xl border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terra hover:text-terra disabled:opacity-50"
                  >
                    {retrying === job.id ? "Retrying…" : "Retry"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
