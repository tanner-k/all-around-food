import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeLocalDB } from "@/lib/local/db";
import { putRecipe } from "@/lib/local/repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalApp } from "../LocalApp";

async function clearDatabase() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => { await clearDatabase(); window.location.hash = "#/cookbook"; });
afterEach(clearDatabase);

it("loads the local cookbook and follows hash navigation in both directions", async () => {
  await putRecipe(recipeFixture());
  render(<LocalApp />);
  expect(screen.getByRole("status")).toHaveTextContent("Opening your local cookbook");
  expect(await screen.findByText("Toast")).toBeInTheDocument();

  act(() => { window.location.hash = "#/cookbook/recipe-1"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByRole("heading", { name: "Toast" })).toBeInTheDocument();
  expect(screen.getAllByText("bread").length).toBeGreaterThan(0);

  act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
  await waitFor(() => expect(screen.getByRole("link", { name: /Toast/ })).toBeInTheDocument());
});

it("keeps a missing local recipe in the shell", async () => {
  window.location.hash = "#/cookbook/missing";
  render(<LocalApp />);
  expect(await screen.findByText("This recipe is not in your local cookbook.")).toBeInTheDocument();
});
