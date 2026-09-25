"use client";

import { useCallback, useEffect, useState } from "react";
import { readSnapshot, subscribeToLocalChanges } from "@/lib/local/repository";
import { parseLocalRoute, type LocalRoute } from "@/lib/local/navigation";
import type { LibrarySnapshot } from "@/lib/local/schema";
import { LocalScreens } from "./LocalScreens";
import { useLocalImportSync } from "./useLocalImportSync";

export function LocalApp() {
  useLocalImportSync();
  const [route, setRoute] = useState<LocalRoute>({ view: "plan" });
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void readSnapshot().then((value) => { setSnapshot(value); setError(null); })
      .catch(() => { setSnapshot(null); setError("Your local library could not be opened. Check browser storage and retry."); });
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseLocalRoute(window.location.hash));
    const onStorageError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setError(detail?.message ?? "Local storage is unavailable.");
    };
    onHashChange();
    refresh();
    const unsubscribe = subscribeToLocalChanges(refresh);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("aaf-local-storage-error", onStorageError);
    return () => {
      unsubscribe();
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("aaf-local-storage-error", onStorageError);
    };
  }, [refresh]);

  return (
    <>
      {error && <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
        {error} <button type="button" onClick={refresh} className="underline">Retry</button>
      </div>}
      {snapshot ? <LocalScreens route={route} snapshot={snapshot} />
        : error ? null : <p role="status" className="text-ink-mute">Opening your local cookbook…</p>}
    </>
  );
}
