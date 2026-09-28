"use client";

import { useEffect, useRef, useState } from "react";
import { useIsCookRoute } from "@/app/(app)/_components/AppHeader";
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, isCurrentLocalAccount, subscribeToLocalAccountChange, type LocalAccount } from "@/lib/local/db";
import { readSnapshot, saveSetting, subscribeToLocalChanges } from "@/lib/local/repository";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function checkReady(worker: ServiceWorker): Promise<{ ready: boolean; buildId?: string }> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve({ ready: false }); }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve({ ready: event.data?.type === "PWA_READY" && event.data.ready === true,
        buildId: event.data?.buildId });
    };
    worker.postMessage({ type: "CHECK_READY" }, [channel.port2]);
  });
}

async function waitForCommittedWrites(account: LocalAccount) {
  const db = await getLocalDB(account);
  assertCurrentLocalAccount(account);
  const tx = db.transaction(
    ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "imports", "settings"],
    "readwrite",
  );
  await tx.done;
  assertCurrentLocalAccount(account);
}

export default function ServiceWorkerRegister() {
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [updateApplied, setUpdateApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const requestedUpdate = useRef(false);
  const pageBuildId = useRef<string | null>(null);
  const persistenceRequest = useRef<LocalAccount | null>(null);
  const isCook = useIsCookRoute();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let stopped = false;
    let registration: ServiceWorkerRegistration | undefined;

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setInstallPrompt(null);
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "PWA_RELEASE_QUERY") {
        event.ports[0]?.postMessage({ buildId: pageBuildId.current });
      }
      if (event.data?.type === "PWA_INSTALL_FAILED" &&
          event.source instanceof ServiceWorker &&
          event.source.scriptURL === new URL("/sw.js", location.origin).href &&
          typeof event.data.detail === "string") {
        setError(`Offline setup failed. ${event.data.detail} Reconnect and reload to retry.`);
      }
    };
    const reportReady = (result: { ready: boolean; buildId?: string }) => {
      if (stopped) return;
      if (!pageBuildId.current && result.ready) pageBuildId.current = result.buildId ?? null;
      setReady(result.ready);
      if (result.ready) setError(null);
    };
    const onControllerChange = () => {
      if (requestedUpdate.current) {
        requestedUpdate.current = false;
        setUpdateApplied(true);
        setWaiting(null);
        setUpdating(false);
      }
      const controller = navigator.serviceWorker.controller;
      if (controller) void checkReady(controller).then(reportReady);
    };
    const onUpdateFound = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        if (worker.state === "redundant" && !registration?.active) setError((current) => current ?? "Offline setup failed. Reconnect and reload to retry.");
      });
    };
    const maybeRequestPersistence = async () => {
      const account = captureLocalAccount();
      if (!account.dbName || persistenceRequest.current === account || !navigator.storage?.persist) return;
      persistenceRequest.current = account;
      try {
        const snapshot = await readSnapshot(account);
        assertCurrentLocalAccount(account);
        const hasSavedData = [snapshot.recipes, snapshot.meal_plans, snapshot.shopping,
          snapshot.pantry, snapshot.cook_progress, snapshot.drafts].some((items) => items.length > 0);
        if (hasSavedData && !snapshot.settings.some((item) => item.key === "storage_persistence_requested")) {
          await navigator.storage.persist();
          assertCurrentLocalAccount(account);
          await saveSetting({ key: "storage_persistence_requested", value: new Date().toISOString() }, account);
        }
      } catch {
        // A storage error is already reported by the local repository.
      } finally {
        if (persistenceRequest.current === account) persistenceRequest.current = null;
      }
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    let unsubscribe = subscribeToLocalChanges(() => { void maybeRequestPersistence(); });
    const unsubscribeAccount = subscribeToLocalAccountChange(() => {
      unsubscribe();
      unsubscribe = subscribeToLocalChanges(() => { void maybeRequestPersistence(); });
      setUpdating(false);
      requestedUpdate.current = false;
      void maybeRequestPersistence();
    });
    void maybeRequestPersistence();

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        if (stopped) return;
        registration.addEventListener("updatefound", onUpdateFound);
        if (registration.installing) onUpdateFound();
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        const active = (await navigator.serviceWorker.ready).active;
        if (active && !stopped) reportReady(await checkReady(active));
        void registration.update().catch(() => undefined);
      } catch (error) {
        if (!stopped) setError((current) => current ?? `Offline setup failed. ${error instanceof Error ? error.message : String(error)} Reconnect and reload to retry.`);
      }
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      stopped = true;
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
      registration?.removeEventListener("updatefound", onUpdateFound);
      unsubscribe();
      unsubscribeAccount();
    };
  }, []);

  async function applyUpdate() {
    if (!waiting) return;
    const account = captureLocalAccount();
    setUpdating(true);
    setError(null);
    try {
      await waitForCommittedWrites(account);
      assertCurrentLocalAccount(account);
      requestedUpdate.current = true;
      waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch {
      if (!isCurrentLocalAccount(account)) return;
      setUpdating(false);
      setError("Could not finish local saves. Try the update again.");
    }
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  // Cook mode hides the passive "Offline ready" note; updates, installs and errors still show.
  const showReady = ready && !isCook;
  if (!showReady && !waiting && !updateApplied && !error && !installPrompt) return null;
  return <div className="fixed bottom-[calc(max(var(--tabbar-height),env(safe-area-inset-bottom))+1rem)] right-4 z-50 flex max-w-xs flex-col gap-2 rounded-xl border border-line bg-paper p-3 text-sm text-ink shadow-lg">
    {showReady && <p role="status" aria-label="Offline ready" className="text-forest">Offline ready</p>}
    {waiting && <div role="status"><p>Update available</p><button type="button" disabled={updating} onClick={() => void applyUpdate()} className="mt-2 rounded-lg bg-forest px-3 py-2 font-semibold text-white disabled:opacity-50">{updating ? "Finishing saves…" : "Update now"}</button></div>}
    {updateApplied && <p role="status">Update installed. Reload when you are ready.</p>}
    {installPrompt && <button type="button" onClick={() => void install()} className="rounded-lg border border-line-strong px-3 py-2 font-semibold">Install app</button>}
    {error && <p role="alert" className="text-warn">{error}</p>}
  </div>;
}
