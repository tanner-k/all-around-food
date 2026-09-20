import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeLocalDB } from "@/lib/local/db";
import { putRecipe, readSnapshot } from "@/lib/local/repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalApp } from "../LocalApp";

async function reset() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => { await reset(); window.location.hash = "#/plan"; });
afterEach(reset);

it("plans repeated recipes, generates shopping, and stocks checked items offline", async () => {
  await putRecipe(recipeFixture());
  render(<LocalApp />);
  await screen.findByText(/Plan your week/);
  fireEvent.click(screen.getAllByRole("button", { name: /Add recipe/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Toast" }));
  await screen.findByText("Toast");
  fireEvent.click(screen.getAllByRole("button", { name: /Add recipe/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Toast" }));
  await waitFor(() => expect(screen.getAllByText("Toast")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: /Review shopping/ }));
  await waitFor(() => expect(window.location.hash).toBe("#/shop"));
  await screen.findByText("bread");
  expect(screen.getByText("4 slices")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "bread" }));
  await screen.findByRole("button", { name: "Mark as bought" });
  fireEvent.click(screen.getByRole("button", { name: "Mark as bought" }));
  await waitFor(async () => expect((await readSnapshot()).shopping).toHaveLength(0));
  act(() => { window.location.hash = "#/pantry"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByText("bread")).toBeInTheDocument();
});
