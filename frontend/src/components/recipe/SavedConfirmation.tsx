"use client";

import Link from "next/link";

export function SavedConfirmation() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="rounded-2xl bg-paper border border-line p-10 flex flex-col items-center gap-4 max-w-sm w-full shadow-sm">
        <span className="text-4xl leading-none">✓</span>
        <p className="font-serif italic text-2xl">
          Saved to your{" "}
          <em className="text-terra not-italic font-serif italic">cookbook</em>.
        </p>
        <Link
          href="/cookbook"
          className="text-terra font-medium hover:underline text-sm"
        >
          View it →
        </Link>
      </div>
    </div>
  );
}
