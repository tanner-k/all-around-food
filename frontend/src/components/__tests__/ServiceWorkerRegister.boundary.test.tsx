import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import ServiceWorkerRegister from "../ServiceWorkerRegister";
const mocks = vi.hoisted(() => ({ getLocalDB: vi.fn(), readSnapshot: vi.fn(), subscribe: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/local/db", async (original) => ({ ...await original<object>(), getLocalDB: mocks.getLocalDB }));
vi.mock("@/lib/local/repository", () => ({ readSnapshot: mocks.readSnapshot, saveSetting: mocks.saveSetting, subscribeToLocalChanges: mocks.subscribe }));
const worker = { postMessage: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production"); selectVerifiedAccount("a");
  mocks.readSnapshot.mockResolvedValue({ recipes: [], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] });
  mocks.subscribe.mockReturnValue(vi.fn());
  vi.stubGlobal("navigator", { serviceWorker: { controller: {}, register: vi.fn().mockResolvedValue({ waiting: worker, addEventListener: vi.fn(), removeEventListener: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }), ready: Promise.resolve({ active: null }), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
});
afterEach(() => { cleanup(); signOutLocalAccount(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["resolve", "reject"])("cancels stale update drain on %s", async (mode) => {
  let resolve!: () => void; let reject!: (error: Error) => void;
  const done = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  mocks.getLocalDB.mockResolvedValue({ transaction: () => ({ done }) });
  render(<ServiceWorkerRegister />);
  fireEvent.click(await screen.findByRole("button", { name: "Update now" }));
  await waitFor(() => expect(mocks.getLocalDB).toHaveBeenCalled());
  await act(async () => { signOutLocalAccount(); selectVerifiedAccount("b"); });
  expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
  await act(async () => { if (mode === "resolve") resolve(); else reject(new Error("failed")); });
  expect(worker.postMessage).not.toHaveBeenCalled(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("rebinds automatic persistence notifications to the selected account", async () => {
  const unsubscribe = vi.fn(); mocks.subscribe.mockReturnValue(unsubscribe);
  render(<ServiceWorkerRegister />); await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(1));
  await act(async () => { signOutLocalAccount(); selectVerifiedAccount("b"); });
  expect(unsubscribe).toHaveBeenCalled(); expect(mocks.subscribe).toHaveBeenCalledTimes(3);
});
