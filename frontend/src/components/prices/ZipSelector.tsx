"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface ZipSelectorProps {
  /** Current ZIP from search params (may be empty string when unset). */
  currentZip: string;
}

/** 5-digit US ZIP validation regex. */
const ZIP_RE = /^\d{5}$/;

export function ZipSelector({ currentZip }: ZipSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(currentZip);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!ZIP_RE.test(trimmed)) {
      setError("Enter a 5-digit ZIP code.");
      return;
    }
    setError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("zip", trimmed);
    // Reset product selection when ZIP changes
    params.delete("id");
    router.push(`?${params.toString()}`);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, "").slice(0, 5);
    setValue(next);
    if (error) setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handleChange}
            placeholder="ZIP code"
            aria-label="ZIP code"
            maxLength={5}
            className={[
              "w-28 rounded-xl border bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none",
              error ? "border-terra" : "border-line focus:border-terra",
            ].join(" ")}
          />
          <button
            type="submit"
            className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] disabled:opacity-50"
          >
            Set ZIP
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-terra">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
