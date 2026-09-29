"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function getWakeLock(): WakeLock | null {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return null;
  }
  return navigator.wakeLock ?? null;
}

/**
 * Keeps the screen on while `active` is true (cook mode) using the Screen
 * Wake Lock API.
 *
 * Support notes: Safari tabs support Wake Lock from 16.4, but iOS Home Screen
 * web apps only from iOS 18.4, so older installed iPhones silently get no lock
 * (and therefore no "Screen stays on" pill). The OS releases the lock whenever
 * the page is hidden; re-acquiring it when the page becomes visible again is
 * expected behavior.
 *
 * Requests can be rejected (low battery, power saving, missing user
 * activation, NotAllowedError). Rejections are swallowed; after one, `retry()`
 * re-requests exactly once (attach it to a user gesture such as
 * onPointerDown). A failure of that retry does not re-arm it; only a new
 * failure from an automatic request (activation or returning to visible) does.
 * `retry` is referentially stable.
 */
export function useScreenWakeLock(active: boolean): {
  active: boolean;
  retry: () => void;
} {
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const pendingRef = useRef(false);
  const desiredRef = useRef(active);
  const retryArmedRef = useRef(false);
  const generationRef = useRef(0);

  const requestLock = useCallback((fromRetry: boolean) => {
    const wakeLock = getWakeLock();
    if (
      !wakeLock ||
      !desiredRef.current ||
      sentinelRef.current ||
      pendingRef.current
    ) {
      return;
    }
    const generation = generationRef.current;
    pendingRef.current = true;

    const onRejected = () => {
      if (generation !== generationRef.current) return;
      pendingRef.current = false;
      if (!fromRetry && desiredRef.current) retryArmedRef.current = true;
    };

    let request: Promise<WakeLockSentinel>;
    try {
      request = wakeLock.request("screen");
    } catch {
      onRejected();
      return;
    }

    request.then((sentinel) => {
      if (generation !== generationRef.current || !desiredRef.current) {
        sentinel.release().catch(() => {});
        return;
      }
      pendingRef.current = false;
      retryArmedRef.current = false;
      sentinelRef.current = sentinel;
      sentinel.addEventListener(
        "release",
        () => {
          if (sentinelRef.current !== sentinel) return;
          sentinelRef.current = null;
          setHeld(false);
        },
        { once: true }
      );
      setHeld(true);
    }, onRejected);
  }, []);

  useEffect(() => {
    desiredRef.current = active;
    if (!active) return;
    requestLock(false);
    return () => {
      desiredRef.current = false;
      generationRef.current += 1;
      pendingRef.current = false;
      retryArmedRef.current = false;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) {
        try {
          sentinel.release().catch(() => {});
        } catch {
          // Ignore release failures; the lock is gone either way.
        }
      }
      setHeld(false);
    };
  }, [active, requestLock]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestLock(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requestLock]);

  const retry = useCallback(() => {
    if (!retryArmedRef.current) return;
    if (
      !getWakeLock() ||
      !desiredRef.current ||
      sentinelRef.current ||
      pendingRef.current
    ) {
      return;
    }
    retryArmedRef.current = false;
    requestLock(true);
  }, [requestLock]);

  return { active: held, retry };
}
