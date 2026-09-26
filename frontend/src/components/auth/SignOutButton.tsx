"use client";

import { signOutLocalAccount } from "@/lib/local/db";

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" onSubmit={signOutLocalAccount}>
      <button
        type="submit"
        className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
      >
        Sign out
      </button>
    </form>
  );
}
