"use client";

import { useCallback, useEffect, useState } from "react";
import { readSnapshot, subscribeToLocalChanges } from "@/lib/local/repository";
import { captureLocalAccount, isCurrentLocalAccount, subscribeToLocalAccountChange } from "@/lib/local/db";
import { parseLocalRoute, type LocalRoute } from "@/lib/local/navigation";
import type { LibrarySnapshot } from "@/lib/local/schema";
import { LocalScreens } from "./LocalScreens";
import { useLocalImportSync } from "./useLocalImportSync";

export function LocalApp() {
  useLocalImportSync();
  const [account, setAccount] = useState(captureLocalAccount);
  const [route, setRoute] = useState<LocalRoute>({ view: "plan" });
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!account.dbName) return;
    void readSnapshot(account).then((value) => { if (isCurrentLocalAccount(account)) { setSnapshot(value); setError(null); } })
      .catch(() => { if (isCurrentLocalAccount(account)) { setSnapshot(null); setError("Your local library could not be opened. Check browser storage and retry."); } });
  }, [account]);

  useEffect(() => subscribeToLocalAccountChange(() => {
    setSnapshot(null); setError(null); setAccount(captureLocalAccount());
  }), []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseLocalRoute(window.location.hash));
    const onStorageError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setError(detail?.message ?? "Local storage is unavailable.");
    };
    onHashChange();
    refresh();
    const unsubscribe = subscribeToLocalChanges(refresh, account);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("aaf-local-storage-error", onStorageError);
    return () => {
      unsubscribe();
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("aaf-local-storage-error", onStorageError);
    };
  }, [refresh, account]);

  return (
    <>
      {error && <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
        {error} <button type="button" onClick={refresh} className="underline">Retry</button>
      </div>}
      {snapshot && isCurrentLocalAccount(account) ? <LocalScreens key={account.generation} route={route} snapshot={snapshot} />
        : !account.dbName ? <p role="status" className="text-ink-mute">Sign in to open your cookbook.</p> : error ? null : <p role="status" className="text-ink-mute">Opening your local cookbook…</p>}
    </>
  );
}
