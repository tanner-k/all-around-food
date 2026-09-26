import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { deleteDB } from "idb";
import { captureLocalAccount, closeLocalDB, selectLegacyGuest, selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { DataSettings } from "../DataSettings";

const owner = "11111111-1111-4111-8111-111111111111";

beforeEach(async () => {
  signOutLocalAccount();
  await closeLocalDB();
  await deleteDB("aaf-local");
  await deleteDB(`aaf-local:${owner}`);
});
afterEach(async () => {
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
  expect(screen.getByRole("button", { name: "Copy cloud records to this device" })).toBeDisabled();
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
