import { useSyncExternalStore } from "react";

/**
 * Whether the service worker reports the app shell cached for offline use.
 * ServiceWorkerRegister writes it; Settings shows it next to the install steps,
 * so the passive status doesn't float over every screen.
 */
let offlineReady = false;
const listeners = new Set<() => void>();

export function setOfflineReady(ready: boolean) {
  if (ready === offlineReady) return;
  offlineReady = ready;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const isOfflineReady = () => offlineReady;

export function useOfflineReady() {
  return useSyncExternalStore(subscribe, isOfflineReady, () => false);
}
