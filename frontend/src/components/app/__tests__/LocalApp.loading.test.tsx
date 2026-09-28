import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalApp } from "../LocalApp";

// Keep the snapshot pending so LocalApp stays on its loading branch.
vi.mock("@/lib/local/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/local/repository")>()),
  readSnapshot: () => new Promise(() => { }),
}));

afterEach(() => { window.location.hash = ""; });

it.each([
  ["#/cookbook", "cookbook-skeleton"],
  ["#/cookbook/recipe-1", "recipe-detail-skeleton"],
])("shows a shape-matched skeleton for %s while the snapshot is pending", async (hash, testId) => {
  window.location.hash = hash;
  render(<LocalApp />);
  expect(await screen.findByTestId(testId)).toBeInTheDocument();
  expect(screen.getByText("Opening your local cookbook…")).toBeInTheDocument();
});

it("keeps the generic loading text for other routes and swaps on navigation", async () => {
  window.location.hash = "#/plan";
  render(<LocalApp />);
  const text = await screen.findByText("Opening your local cookbook…");
  expect(text).not.toHaveClass("sr-only");
  expect(screen.queryByTestId("cookbook-skeleton")).toBeNull();
  expect(screen.queryByTestId("recipe-detail-skeleton")).toBeNull();

  act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByTestId("cookbook-skeleton")).toBeInTheDocument();
});
