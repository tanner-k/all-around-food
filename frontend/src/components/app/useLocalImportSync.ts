"use client";

import { useEffect, useState } from "react";
import { flushLocalImports, listLocalImports } from "@/lib/local/imports";
import { subscribeToLocalChanges } from "@/lib/local/repository";
import { createClient } from "@/lib/supabase/client";

function hasPublicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Remote work runs only while this app is foregrounded and has an import to finish. */
export function useLocalImportSync(): void {
  const [outstanding, setOutstanding] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [foreground, setForeground] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listLocalImports().then((rows) => {
        if (active) setOutstanding(rows.some((row) => row.state === "queued" || row.state === "submitted" ||
          ((row.state === "draft" || row.state === "saved") && !row.acknowledged)));
      }).catch(() => undefined); // The shell's storage-error listener reports the failure.
    };
    refresh();
    const unsubscribe = subscribeToLocalChanges(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);

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
        if (!active) return;
        const valid = !error && Boolean(data.user);
        setSignedIn(valid);
        if (valid) await flushLocalImports();
      }).catch(() => { if (active) setSignedIn(false); });
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    const { data: { subscription } } = client.auth.onAuthStateChange(() => run());
    return () => {
      active = false;
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
      subscription.unsubscribe();
    };
  }, [outstanding]);

  useEffect(() => {
    if (!outstanding || !signedIn || !foreground || !hasPublicConfig()) return;
    const timer = window.setInterval(() => { void flushLocalImports(); }, 5000);
    return () => window.clearInterval(timer);
  }, [outstanding, signedIn, foreground]);
}
