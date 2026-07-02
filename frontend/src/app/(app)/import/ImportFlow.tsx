"use client";

import { useState } from "react";
import { DropZone } from "@/components/recipe/DropZone";
import {
  enqueueUrlJob,
  enqueueImageJob,
} from "@/lib/db/parseJobs";

// Phase 3: importing no longer parses inline. Each handler enqueues exactly one
// `parse_jobs` row (uploading the image first for screenshot kinds); the worker
// (Phase 4) drains the queue and creates the recipe. On success we show a brief
// confirmation, then reset to idle so more sources can be added. The finished
// recipe surfaces in `ImportQueue` once `result_recipe_id` lands.

type State =
  | { kind: "idle" }
  | { kind: "enqueuing" }
  | { kind: "queued" };

export function ImportFlow() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleImage(
    _base64: string,
    _mediaType: "image/jpeg" | "image/png" | "image/webp",
    file: File
  ) {
    setState({ kind: "enqueuing" });
    try {
      await enqueueImageJob(file, "screenshot");
      setState({ kind: "queued" });
    } catch (err) {
      console.error("[import] enqueue image failed:", err);
      alert(`Failed to add to the queue: ${String(err)}`);
      setState({ kind: "idle" });
    }
  }

  async function handleUrl(url: string) {
    setState({ kind: "enqueuing" });
    try {
      await enqueueUrlJob(url);
      setState({ kind: "queued" });
    } catch (err) {
      console.error("[import] enqueue URL failed:", err);
      alert(`Failed to add to the queue: ${String(err)}`);
      setState({ kind: "idle" });
    }
  }

  // TikTok/Instagram links classify to a `video` job inside `enqueueUrlJob`, so
  // the video handler shares the same enqueue path as a plain URL.
  async function handleVideoUrl(url: string) {
    await handleUrl(url);
  }

  if (state.kind === "enqueuing") {
    return (
      <div className="rounded-2xl bg-paper border border-line p-8 max-w-md flex items-center gap-4">
        <span className="text-terra animate-pulse text-2xl">⏳</span>
        <p className="text-ink-soft font-medium">Adding to the queue…</p>
      </div>
    );
  }

  if (state.kind === "queued") {
    return (
      <div className="rounded-2xl bg-paper border border-line p-8 max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="text-terra text-2xl leading-none">✓</span>
          <p className="font-serif italic text-xl text-ink">
            Added to the <em className="text-terra">queue</em>
          </p>
        </div>
        <p className="text-sm text-ink-mute">
          Your recipe will appear shortly — track it in the queue below.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="self-start rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230]"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <DropZone
      onImage={handleImage}
      onUrl={handleUrl}
      onVideoUrl={handleVideoUrl}
    />
  );
}
