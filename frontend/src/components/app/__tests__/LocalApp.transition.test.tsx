import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeLocalDB } from "@/lib/local/db";
import { putRecipe } from "@/lib/local/repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalApp } from "../LocalApp";

/** lib.dom types startViewTransition; tests swap in a minimal stand-in. */
type Doc = { startViewTransition?: unknown };

async function clearDatabase() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => { await clearDatabase(); window.location.hash = "#/cookbook"; });
afterEach(async () => {
  delete (document as unknown as Doc).startViewTransition;
  vi.unstubAllGlobals();
  await clearDatabase();
});

it("renders the new screen synchronously inside a view transition, with the direction set", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
  await putRecipe(recipeFixture());
  const calls: { before: boolean; after: boolean; direction?: string }[] = [];
  (document as unknown as Doc).startViewTransition = vi.fn((callback: () => void) => {
    const before = screen.queryByRole("heading", { name: "Toast" }) !== null;
    const direction = document.documentElement.dataset.navDirection;
    callback();
    calls.push({ before, after: screen.queryByRole("heading", { name: "Toast" }) !== null, direction });
    return { finished: new Promise(() => undefined) };
  });
  render(<LocalApp />);
  expect(await screen.findByText("Toast")).toBeInTheDocument();
  // Mounting reads the hash directly: no transition for the first screen.
  expect(document.startViewTransition).not.toHaveBeenCalled();

  act(() => { window.location.hash = "#/cookbook/recipe-1"; window.dispatchEvent(new Event("hashchange")); });
  expect(calls[0]).toEqual({ before: false, after: true, direction: "push" });
});

it("commits directly when reduced motion is requested", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
  await putRecipe(recipeFixture());
  (document as unknown as Doc).startViewTransition = vi.fn();
  render(<LocalApp />);
  expect(await screen.findByText("Toast")).toBeInTheDocument();

  act(() => { window.location.hash = "#/cookbook/recipe-1"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByRole("heading", { name: "Toast" })).toBeInTheDocument();
  expect(document.startViewTransition).not.toHaveBeenCalled();
});
