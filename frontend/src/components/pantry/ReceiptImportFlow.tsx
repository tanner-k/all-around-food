"use client";

import { useState } from "react";
import { DropZone } from "@/components/recipe/DropZone";
import { ParsingProgress } from "@/components/recipe/ParsingProgress";
import { ReceiptReview } from "./ReceiptReview";
import { importReceiptItems, parseReceipt } from "@/lib/api";
import type { ReceiptParse } from "@/lib/shopping-schema";

const RECEIPT_STEPS = [
  "Reading receipt…",
  "Identifying items…",
  "Categorizing by aisle…",
  "Final review",
];

type State =
  | { kind: "idle" }
  | { kind: "parsing"; complete: boolean }
  | { kind: "review"; parsed: ReceiptParse }
  | { kind: "saving"; parsed: ReceiptParse }
  | { kind: "saved"; added: number; updated: number };

interface ReceiptImportFlowProps {
  /** Called after items are committed, so the pantry list can refresh. */
  onImported: () => Promise<void>;
}

export function ReceiptImportFlow({ onImported }: ReceiptImportFlowProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleImage(
    base64: string,
    mediaType: "image/jpeg" | "image/png" | "image/webp"
  ) {
    setState({ kind: "parsing", complete: false });
    try {
      const parsed = await parseReceipt(base64, mediaType);
      setState({ kind: "parsing", complete: true });
      setTimeout(() => setState({ kind: "review", parsed }), 400);
    } catch (err) {
      console.error("[receipt] parse failed:", err);
      alert(`Failed to read receipt: ${String(err)}`);
      setState({ kind: "idle" });
    }
  }

  async function handleConfirm(parsed: ReceiptParse, names: string[]) {
    setState({ kind: "saving", parsed });
    try {
      const result = await importReceiptItems(names);
      setState({
        kind: "saved",
        added: result.added,
        updated: result.updated,
      });
      await onImported();
    } catch (err) {
      console.error("[receipt] import failed:", err);
      alert(`Failed to import items: ${String(err)}`);
      setState({ kind: "review", parsed });
    }
  }

  if (state.kind === "idle") {
    return <DropZone variant="receipt" onImage={handleImage} />;
  }

  if (state.kind === "parsing") {
    return (
      <div className="max-w-md rounded-2xl border border-line bg-paper p-8">
        <h3 className="mb-6 font-serif text-xl italic text-ink">
          Reading the <em className="text-terra">receipt</em>…
        </h3>
        <ParsingProgress complete={state.complete} steps={RECEIPT_STEPS} />
      </div>
    );
  }

  if (state.kind === "review") {
    return (
      <ReceiptReview
        parsed={state.parsed}
        onConfirm={(names) => handleConfirm(state.parsed, names)}
        onCancel={() => setState({ kind: "idle" })}
      />
    );
  }

  if (state.kind === "saving") {
    return (
      <div className="flex max-w-md items-center gap-4 rounded-2xl border border-line bg-paper p-8">
        <span className="animate-pulse text-2xl text-terra">⏳</span>
        <p className="font-medium text-ink-soft">Adding items to your pantry…</p>
      </div>
    );
  }

  // saved
  return (
    <div className="max-w-md rounded-2xl border border-line bg-paper p-6">
      <p className="font-serif text-xl text-ink">
        Pantry <em className="italic text-terra">updated</em>.
      </p>
      <p className="mt-1 text-sm text-ink-mute">
        {state.added} added · {state.updated} refreshed.
      </p>
      <button
        type="button"
        onClick={() => setState({ kind: "idle" })}
        className="mt-4 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
      >
        Upload another
      </button>
    </div>
  );
}
