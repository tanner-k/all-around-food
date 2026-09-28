/**
 * Light / Dark / System appearance preference (plan 09).
 *
 * The raw preference lives in localStorage, not IndexedDB: it must survive
 * sign-in/out (IndexedDB is per-account) and resolve synchronously before
 * first paint. The document always carries the *resolved* theme in
 * `data-theme` so Tailwind's `dark:` variant works for system dark mode too.
 *
 * `themeInitScript()` is the inline `<head>` copy of this logic; keep the two
 * in step (both are unit-tested against the same cases).
 */
import { TERRA_HEX, THEME_COLOR_DARK_HEX } from "@/lib/theme";

export const THEME_STORAGE_KEY = "aaf-theme";
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

function themeColorFor(preference: ThemePreference, media: string | null): string {
  if (preference === "system") return media?.includes("dark") ? THEME_COLOR_DARK_HEX : TERRA_HEX;
  return preference === "dark" ? THEME_COLOR_DARK_HEX : TERRA_HEX;
}

export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(preference);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", themeColorFor(preference, meta.getAttribute("media")));
  });
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  applyTheme(preference);
  notify();
}

/** `useSyncExternalStore` subscriber: own writes plus other tabs' writes. */
export function subscribeThemePreference(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Source of the pre-hydration `<head>` script. Mirrors readThemePreference,
 * resolveTheme and applyTheme; also re-applies on DOMContentLoaded (the
 * theme-color metas may not be parsed yet), on system scheme changes while
 * the preference is "system", and on cross-tab storage changes.
 */
export function themeInitScript(): string {
  const constants = [
    `K=${JSON.stringify(THEME_STORAGE_KEY)}`,
    `L=${JSON.stringify(TERRA_HEX)}`,
    `D=${JSON.stringify(THEME_COLOR_DARK_HEX)}`,
  ].join(",");
  return (
    `(function(){var ${constants},d=document,r=d.documentElement,m=null;` +
    `try{m=window.matchMedia?window.matchMedia(${JSON.stringify(DARK_QUERY)}):null}catch(e){}` +
    `function p(){try{var v=localStorage.getItem(K);return v==="light"||v==="dark"||v==="system"?v:"system"}catch(e){return "system"}}` +
    `function a(){var v=p(),n=d.querySelectorAll('meta[name="theme-color"]');` +
    `r.dataset.theme=v==="system"?(m&&m.matches?"dark":"light"):v;` +
    `for(var i=0;i<n.length;i++){var q=n[i].getAttribute("media")||"";` +
    `n[i].setAttribute("content",v==="system"?(q.indexOf("dark")>=0?D:L):v==="dark"?D:L)}}` +
    `a();if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",a);` +
    `if(m){var f=function(){if(p()==="system")a()};` +
    `if(m.addEventListener)m.addEventListener("change",f);else if(m.addListener)m.addListener(f)}` +
    `window.addEventListener("storage",function(e){if(e.key===K||e.key===null)a()})})();`
  );
}
