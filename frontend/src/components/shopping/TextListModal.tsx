"use client";

import { useState } from "react";
import { textShoppingList } from "@/lib/api";
import {
  getRememberedRecipients,
  rememberRecipient,
} from "@/lib/sms-recipients";

interface TextListModalProps {
  onClose: () => void;
}

export function TextListModal({ onClose }: TextListModalProps) {
  const [recipient, setRecipient] = useState("");
  const [remembered, setRemembered] = useState<string[]>(
    getRememberedRecipients
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSend() {
    const number = recipient.trim();
    if (!number || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await textShoppingList(number);
      setRemembered(rememberRecipient(result.sent_to));
      const noun = result.item_count === 1 ? "item" : "items";
      setSuccess(
        `Sent ${result.item_count} ${noun} to ${result.sent_to}.`
      );
      setRecipient("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send text");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-2xl border border-line bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-ink">
          Text your <em className="italic text-terra">shopping list</em>
        </h3>
        <p className="mb-4 mt-1 text-sm text-ink-mute">
          Sends your unchecked items, grouped by aisle, via Apple Messages.
          Works when the app is running on a signed-in Mac.
        </p>

        <label
          htmlFor="text-list-recipient"
          className="text-sm font-medium text-ink-soft"
        >
          Phone number
        </label>
        <input
          id="text-list-recipient"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="+1 555 123 4567"
          className="mt-1 rounded-xl border border-line bg-paper-2 px-4 py-2 text-sm text-ink outline-none focus:border-terra"
        />

        {remembered.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {remembered.map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => setRecipient(number)}
                className="rounded-full border border-line bg-paper-2 px-3 py-1 text-xs text-ink-soft transition-colors hover:border-terra hover:text-terra"
              >
                {number}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {success}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || recipient.trim() === ""}
            className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send text"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
          >
            {success ? "Done" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
