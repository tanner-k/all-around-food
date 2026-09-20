import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalImportSync } from "../useLocalImportSync";

const { listLocalImports, flushLocalImports, createClient } = vi.hoisted(() => ({
  listLocalImports: vi.fn(), flushLocalImports: vi.fn(), createClient: vi.fn(),
}));
vi.mock("@/lib/local/imports", () => ({ listLocalImports, flushLocalImports }));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

function Harness() { useLocalImportSync(); return null; }
const queued = { id: "one", state: "queued", acknowledged: false };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  listLocalImports.mockResolvedValue([]);
  flushLocalImports.mockResolvedValue(undefined);
  createClient.mockReturnValue({ auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner" } }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  } });
});
afterEach(() => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; vi.useRealTimers(); });

it("never initializes auth when there is no import work", async () => {
  render(<Harness />);
  await waitFor(() => expect(listLocalImports).toHaveBeenCalled());
  expect(createClient).not.toHaveBeenCalled();
  expect(flushLocalImports).not.toHaveBeenCalled();
});

it("syncs outstanding work on mount, focus, and online; pauses while hidden", async () => {
  listLocalImports.mockResolvedValue([queued]);
  render(<Harness />);
  await waitFor(() => expect(flushLocalImports).toHaveBeenCalledTimes(1));
  act(() => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(flushLocalImports).toHaveBeenCalledTimes(2));
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(flushLocalImports).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await waitFor(() => expect(flushLocalImports).toHaveBeenCalledTimes(3));
});
