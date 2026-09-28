import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERRA_HEX, THEME_COLOR_DARK_HEX } from "@/lib/theme";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeThemePreference,
  themeInitScript,
} from "@/lib/theme-preference";

type Listener = (event: { matches: boolean }) => void;

function mockMatchMedia(initial: boolean, { legacy = false } = {}) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    media: "(prefers-color-scheme: dark)",
    ...(legacy
      ? { addListener: (cb: Listener) => listeners.add(cb), removeListener: (cb: Listener) => listeners.delete(cb) }
      : {
          addEventListener: (_: string, cb: Listener) => listeners.add(cb),
          removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
        }),
  };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => mql) });
  return {
    change(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
}

function addThemeMetas() {
  for (const media of ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("media", media);
    meta.setAttribute("content", "unset");
    document.head.appendChild(meta);
  }
}

function metaContents() {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map((meta) => meta.content);
}

function runInitScript() {
  new Function(themeInitScript())();
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
});

describe("readThemePreference / setThemePreference", () => {
  it("defaults to system when missing or invalid", () => {
    expect(readThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe("system");
  });

  it("round-trips manual choices and clears the key for system", () => {
    setThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference()).toBe("dark");
    setThemePreference("light");
    expect(readThemePreference()).toBe("light");
    setThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readThemePreference()).toBe("system");
  });

  it("falls back to system when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readThemePreference()).toBe("system");
    expect(() => setThemePreference("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("notifies subscribers on own writes and cross-tab storage events", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeThemePreference(callback);
    setThemePreference("dark");
    expect(callback).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    expect(callback).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
    setThemePreference("light");
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

describe("resolveTheme", () => {
  it("resolves system through matchMedia", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("returns manual choices unchanged and survives a missing matchMedia", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: undefined });
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("writes the resolved theme to data-theme", () => {
    mockMatchMedia(true);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("forces theme-color metas for a manual choice and restores them for system", () => {
    addThemeMetas();
    applyTheme("dark");
    expect(metaContents()).toEqual([THEME_COLOR_DARK_HEX, THEME_COLOR_DARK_HEX]);
    applyTheme("light");
    expect(metaContents()).toEqual([TERRA_HEX, TERRA_HEX]);
    applyTheme("system");
    expect(metaContents()).toEqual([TERRA_HEX, THEME_COLOR_DARK_HEX]);
  });
});

describe("themeInitScript", () => {
  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    [null, true, "dark"],
    [null, false, "light"],
    ["garbage", true, "dark"],
  ] as const)("stored %s with system dark=%s resolves to %s", (stored, systemDark, expected) => {
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    mockMatchMedia(systemDark);
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe(expected);
  });

  it("falls back to system when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockMatchMedia(true);
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("runs without matchMedia", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: undefined });
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("updates theme-color metas like applyTheme", () => {
    addThemeMetas();
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(metaContents()).toEqual([THEME_COLOR_DARK_HEX, THEME_COLOR_DARK_HEX]);
    localStorage.removeItem(THEME_STORAGE_KEY);
    runInitScript();
    expect(metaContents()).toEqual([TERRA_HEX, THEME_COLOR_DARK_HEX]);
  });

  it("follows system changes only while the preference is system", () => {
    const media = mockMatchMedia(false);
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("light");
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.documentElement.dataset.theme = "light";
    media.change(false);
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("uses the legacy addListener API when addEventListener is missing", () => {
    const media = mockMatchMedia(false, { legacy: true });
    runInitScript();
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("embeds the canonical hex values", () => {
    const source = themeInitScript();
    expect(source).toContain(TERRA_HEX);
    expect(source).toContain(THEME_COLOR_DARK_HEX);
    expect(source).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });
});
