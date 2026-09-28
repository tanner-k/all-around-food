import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { deleteDB } from "idb";
import { captureLocalAccount, closeLocalDB, selectLegacyGuest, selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { DataSettings } from "../DataSettings";
import { setOfflineReady } from "@/lib/pwa-status";

const owner = "11111111-1111-4111-8111-111111111111";

beforeEach(async () => {
  signOutLocalAccount();
  await closeLocalDB();
  await deleteDB("aaf-local");
  await deleteDB(`aaf-local:${owner}`);
});
afterEach(async () => {
  setOfflineReady(false);
  signOutLocalAccount();
  await closeLocalDB();
  await deleteDB("aaf-local");
  await deleteDB(`aaf-local:${owner}`);
});

it("shows why verified accounts cannot restore or copy before synced enrollment", async () => {
  selectVerifiedAccount(owner);
  render(<DataSettings />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Download local backup" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Merge backup" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Replace local library" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Copy cloud records to this device" })).toBeNull();
  expect(screen.getByText(/account migration is ready/i)).toBeInTheDocument();
});

it("keeps guest backup restore available", async () => {
  selectLegacyGuest();
  render(<DataSettings />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Merge backup" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Replace local library" })).toBeEnabled();
});

it("offers sign-in and hides the account immediately when sign-out starts", async () => {
  selectVerifiedAccount(owner);
  render(<DataSettings />);
  expect(screen.getByRole("link", {name:"Sign in"})).toHaveAttribute("href", "/login");
  fireEvent.submit(screen.getByRole("button", {name:"Sign out"}).closest("form")!);
  expect(captureLocalAccount().dbName).toBe("");
});

it("shows full sync detail with exactly one sign-in link", async () => {
  const { vi } = await import("vitest");
  selectVerifiedAccount(owner);
  const syncNow = vi.fn();
  render(<DataSettings sync={{ account: captureLocalAccount(), status: { pending: 2, deferred: 0, conflicts: 0, lastSuccessAt: null }, running: false, authRequired: true, ready: true, stage: "recipes", syncNow }} />);
  expect(screen.getByRole("heading", { name: "Library sync" })).toBeInTheDocument();
  expect(screen.getByText("Sign in to sync")).toBeInTheDocument();
  expect(screen.getByText(/2 recipe changes waiting/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  expect(syncNow).toHaveBeenCalled();
});

it("offers explicit recipe review while account Replace stays blocked", async () => {
 selectVerifiedAccount(owner); render(<DataSettings />);
 await waitFor(() => expect(screen.getByRole("button", { name: "Review recipes on this device" })).toBeEnabled());
 expect(screen.getByRole("button", { name: "Replace local library" })).toBeDisabled();
 expect(screen.getByText(/only recipes are copied/i)).toBeInTheDocument();
});

it("requires both backup downloads and confirmation before a recipe copy", async () => {
 const { vi } = await import("vitest");
 const { openDB } = await import("idb");
 const { recipeFixture } = await import("@/lib/__tests__/fixtures/recipe");
 const { getLocalDB } = await import("@/lib/local/db");
 const guest = await openDB("aaf-local", 1, { upgrade(db) { db.createObjectStore("recipes", { keyPath: "id" }); } });
 await guest.put("recipes", { ...recipeFixture(), title: "Niku Miso" }); guest.close();
 vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:backup"), revokeObjectURL: vi.fn() }));
 const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
 selectVerifiedAccount(owner); render(<DataSettings />);
 fireEvent.click(await screen.findByRole("button", { name: "Review recipes on this device" }));
 expect(await screen.findByText("Niku Miso")).toBeInTheDocument();
 const copy = screen.getByRole("button", { name: "Copy reviewed recipes" }); expect(copy).toBeDisabled();
 const confirmation = screen.getByRole("checkbox", { name: /saved both backup files/i }); expect(confirmation).toBeDisabled();
 fireEvent.click(screen.getByRole("button", { name: "Download source backup" }));
 await waitFor(() => expect(click).toHaveBeenCalledTimes(1)); expect(confirmation).toBeDisabled();
 fireEvent.click(screen.getByRole("button", { name: "Download account backup before copy" }));
 await waitFor(() => expect(confirmation).toBeEnabled()); expect(copy).toBeDisabled();
 fireEvent.click(confirmation); expect(copy).toBeEnabled(); fireEvent.click(copy);
 expect(await screen.findByText(/1 recipes copied, 0 kept, 1 recipe changes/)).toBeInTheDocument();
 expect(await (await getLocalDB()).getAll("recipes")).toHaveLength(1);
 click.mockRestore(); vi.unstubAllGlobals();
});

it("shows Offline ready beside the install steps once the app shell is cached", async () => {
  selectLegacyGuest();
  render(<DataSettings />);
  expect(screen.queryByRole("status", { name: "Offline ready" })).toBeNull();
  act(() => setOfflineReady(true));
  expect(await screen.findByRole("status", { name: "Offline ready" })).toBeInTheDocument();
});
