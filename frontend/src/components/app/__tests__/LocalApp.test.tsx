import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeLocalDB } from "@/lib/local/db";
import { putRecipe, readSnapshot } from "@/lib/local/repository";
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
  expect(screen.getByText("Opening your local cookbook…")).toBeInTheDocument();
  expect(screen.getByTestId("cookbook-skeleton")).toBeInTheDocument();
  expect(await screen.findByText("Toast")).toBeInTheDocument();

  act(() => { window.location.hash = "#/cookbook/recipe-1"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByRole("heading", { name: "Toast" })).toBeInTheDocument();
  expect(screen.getAllByText("bread").length).toBeGreaterThan(0);

  act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
  await waitFor(() => expect(screen.getByRole("link", { name: /Toast/ })).toBeInTheDocument());
});

function goTo(hash: string) {
  act(() => { window.location.hash = hash; window.dispatchEvent(new Event("hashchange")); });
}

async function fillAndSaveNewRecipe(title: string) {
  await screen.findByRole("heading", { name: "New recipe" });
  fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: title } });
  fireEvent.change(screen.getByPlaceholderText("e.g. olive oil"), { target: { value: "bread" } });
  fireEvent.change(document.querySelectorAll("textarea")[1], { target: { value: "Toast it." } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("heading", { name: title });
}

it("gives every manual recipe its own id within one mounted app", async () => {
  render(<LocalApp />);
  await screen.findByRole("link", { name: "+ Add recipe" });

  goTo("#/cookbook/new");
  await fillAndSaveNewRecipe("First recipe");

  goTo("#/cookbook");
  await screen.findByRole("link", { name: /First recipe/ });
  goTo("#/cookbook/new");
  await fillAndSaveNewRecipe("Second recipe");

  const { recipes } = await readSnapshot();
  expect(recipes.map((item) => item.title).sort()).toEqual(["First recipe", "Second recipe"]);
  expect(new Set(recipes.map((item) => item.id)).size).toBe(2);
  expect(recipes.every((item) => item.ingredients[0].name === "bread")).toBe(true);
});

it("keeps a missing local recipe in the shell", async () => {
  window.location.hash = "#/cookbook/missing";
  render(<LocalApp />);
  expect(await screen.findByText("This recipe is not in your local cookbook.")).toBeInTheDocument();
});

it("keeps a completed manual cook idempotent after reload and starts a fresh cook explicitly", async () => {
  await putRecipe(recipeFixture());
  window.location.hash = "#/cookbook/recipe-1";
  const firstRender = render(<LocalApp />);
  await screen.findByRole("heading", { name: "Toast" });

  fireEvent.click(screen.getByRole("button", { name: "Mark cooked" }));
  await screen.findByRole("button", { name: "Cooked" });
  await expect(readSnapshot()).resolves.toMatchObject({
    recipes: [expect.objectContaining({ times_made: 1 })],
  });
  const firstSession = (await readSnapshot()).cook_progress[0].session_id;
  firstRender.unmount();

  render(<LocalApp />);
  await screen.findByRole("heading", { name: "Toast" });
  fireEvent.click(screen.getByRole("button", { name: "Mark cooked" }));
  await screen.findByRole("button", { name: "Cooked" });
  await expect(readSnapshot()).resolves.toMatchObject({
    recipes: [expect.objectContaining({ times_made: 1 })],
  });

  fireEvent.click(screen.getByRole("link", { name: "Start cooking" }));
  await waitFor(() => expect(window.location.hash).toBe("#/cookbook/recipe-1/cook"));
  await waitFor(() => expect(readSnapshot()).resolves.toMatchObject({
    cook_progress: [expect.objectContaining({ session_id: expect.any(String), completed_at: null })],
  }));
  expect((await readSnapshot()).cook_progress[0].session_id).not.toBe(firstSession);
});

it("portals the sync chip into the header slot everywhere except cook mode", async () => {
  await putRecipe(recipeFixture());
  const slot = document.createElement("span");
  slot.id = "app-header-status";
  document.body.append(slot);
  try {
    render(<LocalApp />);
    expect(await screen.findByText("Toast")).toBeInTheDocument();
    const chip = within(slot).getByRole("link", { name: "Sign in to sync" });
    expect(chip).toHaveAttribute("href", "/app#/settings");
    expect(screen.getAllByRole("status", { hidden: true }).filter((node) => node.textContent === "Sign in to sync")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Library sync" })).toBeNull();

    goTo("#/cookbook/recipe-1/cook");
    await waitFor(() => expect(slot).toBeEmptyDOMElement());
    expect(screen.queryByText(/sync/i)).toBeNull();

    goTo("#/settings");
    expect(await screen.findByRole("region", { name: "Library sync" })).toBeInTheDocument();
    expect(within(slot).getByRole("status")).toHaveTextContent("Sign in to sync");
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(1);
  } finally {
    slot.remove();
  }
});

it("opens new screens at the top and leaves scroll alone when going back", async () => {
  await putRecipe(recipeFixture());
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<LocalApp />);
  expect(await screen.findByText("Toast")).toBeInTheDocument();
  scrollTo.mockClear();

  act(() => { window.location.hash = "#/cookbook/recipe-1"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByRole("heading", { name: "Toast" })).toBeInTheDocument();
  expect(scrollTo).toHaveBeenCalledWith(0, 0);

  scrollTo.mockClear();
  act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
  await waitFor(() => expect(screen.getByRole("link", { name: /Toast/ })).toBeInTheDocument());
  expect(scrollTo).not.toHaveBeenCalled();

  act(() => { window.location.hash = "#/shop"; window.dispatchEvent(new Event("hashchange")); });
  await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
  scrollTo.mockRestore();
});
