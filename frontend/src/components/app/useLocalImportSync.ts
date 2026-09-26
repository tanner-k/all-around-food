"use client";

import { useEffect, useState } from "react";
import { flushLocalImports } from "@/lib/local/imports";
import { subscribeToLocalChanges } from "@/lib/local/repository";
import { createClient } from "@/lib/supabase/client";
import { captureLocalAccount, isCurrentLocalAccount, subscribeToLocalAccountChange } from "@/lib/local/db";

/** Discover owner-wide queue metadata even on a device with no submitted jobs. */
export function useLocalImportSync(): void {
  const [account, setAccount] = useState(captureLocalAccount);
  useEffect(() => subscribeToLocalAccountChange(() => setAccount(captureLocalAccount())), []);
  useEffect(() => {
    if (!account.ownerId || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let active = true;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const client = createClient();
    const run = () => {
      if (!active || !isCurrentLocalAccount(account) || !navigator.onLine || document.visibilityState !== "visible") return;
      // flush verifies fresh Auth and guards each network/local boundary itself.
      void flushLocalImports(account).catch(() => undefined); // Storage failures are account-scoped; network errors retry on the next poll.
    };
    run();
    const unsubscribeChanges = subscribeToLocalChanges(run, account);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      clearTimeout(authTimer); authTimer = setTimeout(run, 0);
    });
    const timer = window.setInterval(run, 5000);
    return () => {
      active = false; clearTimeout(authTimer); window.clearInterval(timer); unsubscribeChanges(); subscription.unsubscribe();
      window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run);
    };
  }, [account]);
}
