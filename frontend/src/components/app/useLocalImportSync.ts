"use client";

import { useEffect, useState } from "react";
import { flushLocalImports, listLocalImports } from "@/lib/local/imports";
import { subscribeToLocalChanges } from "@/lib/local/repository";
import { createClient } from "@/lib/supabase/client";
import { captureLocalAccount, isCurrentLocalAccount, subscribeToLocalAccountChange } from "@/lib/local/db";

function hasPublicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Remote work runs only while this app is foregrounded and has an import to finish. */
export function useLocalImportSync(): void {
  const [account, setAccount] = useState(captureLocalAccount);
  const [outstanding, setOutstanding] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [foreground, setForeground] = useState(false);

  useEffect(() => subscribeToLocalAccountChange(() => {
    setAccount(captureLocalAccount()); setOutstanding(false); setSignedIn(false); setForeground(false);
  }), []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listLocalImports(account).then((rows) => {
        if (active && isCurrentLocalAccount(account)) setOutstanding(rows.some((row) => row.state === "queued" || row.state === "submitted" ||
          ((row.state === "draft" || row.state === "saved") && !row.acknowledged)));
      }).catch(() => undefined); // The shell's storage-error listener reports the failure.
    };
    refresh();
    const unsubscribe = subscribeToLocalChanges(refresh, account);
    return () => { active = false; unsubscribe(); };
  }, [account]);

  useEffect(() => {
    if (!outstanding || !hasPublicConfig()) return;
    let active = true;
    const client = createClient();
    const canRun = () => navigator.onLine && document.visibilityState === "visible";
    const run = () => {
      const ready = canRun();
      setForeground(ready);
      if (!ready) return;
      void client.auth.getUser().then(async ({ data, error }) => {
        if (!active || !isCurrentLocalAccount(account)) return;
        const valid = !error && Boolean(account.ownerId) && data.user?.id === account.ownerId;
        setSignedIn(valid);
        if (valid) await flushLocalImports(account);
      }).catch(() => { if (active && isCurrentLocalAccount(account)) setSignedIn(false); });
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = client.auth.onAuthStateChange(() => { clearTimeout(authTimer); authTimer = setTimeout(run, 0); });
    return () => {
      active = false;
      clearTimeout(authTimer);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      subscription.unsubscribe();
    };
  }, [outstanding, account]);

  useEffect(() => {
    if (!outstanding || !signedIn || !foreground || !hasPublicConfig()) return;
    const timer = window.setInterval(() => { void flushLocalImports(account); }, 5000);
    return () => window.clearInterval(timer);
  }, [outstanding, signedIn, foreground, account]);
}
