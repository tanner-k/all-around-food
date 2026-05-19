"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/recipe-schema";
import { DropZone } from "@/components/recipe/DropZone";
import { ParsingProgress } from "@/components/recipe/ParsingProgress";
import { RecipeReview } from "@/components/recipe/RecipeReview";
import { SavedConfirmation } from "@/components/recipe/SavedConfirmation";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; complete: boolean }
  | { kind: "review"; recipe: Recipe }
  | { kind: "saving"; recipe: Recipe }
  | { kind: "saved"; recipe: Recipe };

export function ImportFlow() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleImage(
    base64: string,
    mediaType: "image/jpeg" | "image/png" | "image/webp"
  ) {
    setState({ kind: "parsing", complete: false });
    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "image", data: base64, mediaType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Parse failed");
      }
      const recipe: Recipe = await res.json();
      setState({ kind: "parsing", complete: true });
      // Small delay to let the progress animation finish
      setTimeout(() => setState({ kind: "review", recipe }), 500);
    } catch (err) {
      console.error("[import] image parse failed:", err);
      // Reset to idle with a brief error notice — keep it simple for v1
      alert(`Failed to parse recipe: ${String(err)}`);
      setState({ kind: "idle" });
    }
  }

  async function handleUrl(url: string) {
    setState({ kind: "parsing", complete: false });
    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "url", url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Parse failed");
      }
      const recipe: Recipe = await res.json();
      setState({ kind: "parsing", complete: true });
      setTimeout(() => setState({ kind: "review", recipe }), 500);
    } catch (err) {
      console.error("[import] URL parse failed:", err);
      alert(`Failed to parse recipe: ${String(err)}`);
      setState({ kind: "idle" });
    }
  }

  async function handleSave(recipe: Recipe) {
    setState({ kind: "saving", recipe });
    const withId = { ...recipe, id: crypto.randomUUID() };
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withId),
      });
      if (!res.ok) {
        throw new Error("Save failed");
      }
      setState({ kind: "saved", recipe: withId });
    } catch (err) {
      console.error("[import] save failed:", err);
      alert(`Failed to save recipe: ${String(err)}`);
      setState({ kind: "review", recipe });
    }
  }

  if (state.kind === "idle") {
    return <DropZone onImage={handleImage} onUrl={handleUrl} />;
  }

  if (state.kind === "parsing") {
    return (
      <div className="rounded-2xl bg-paper border border-line p-8 max-w-md">
        <h3 className="font-serif italic text-xl text-ink mb-6">
          Reading the <em className="text-terra">recipe</em>…
        </h3>
        <ParsingProgress complete={state.complete} />
      </div>
    );
  }

  if (state.kind === "review") {
    return (
      <RecipeReview
        recipe={state.recipe}
        onSave={handleSave}
      />
    );
  }

  if (state.kind === "saving") {
    return (
      <div className="rounded-2xl bg-paper border border-line p-8 max-w-md flex items-center gap-4">
        <span className="text-terra animate-pulse text-2xl">⏳</span>
        <p className="text-ink-soft font-medium">Saving to your cookbook…</p>
      </div>
    );
  }

  if (state.kind === "saved") {
    return <SavedConfirmation />;
  }

  return null;
}
