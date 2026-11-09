import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CookbookList } from "./CookbookList";
import type { Recipe } from "@/lib/recipe-schema";
import { localHref } from "@/lib/local/navigation";

const recipe = (id: string, title: string, times_made: number): Recipe =>
  ({ id, title, times_made } as Recipe);

it("groups accented Latin titles by base letter and nonletters under #", () => {
  render(
    <CookbookList
      recipes={[
        recipe("q", "7 layer dip", 0),
        recipe("e", "Éclair", 1),
        recipe("a", "Apple", 3),
      ]}
    />,
  );

  expect(screen.getByRole("heading", { name: "A" })).toHaveAttribute(
    "id",
    "recipe-letter-A",
  );
  expect(screen.getByRole("heading", { name: "E" })).toHaveAttribute(
    "id",
    "recipe-letter-E",
  );
  expect(screen.getByRole("heading", { name: "#" })).toHaveAttribute(
    "id",
    "recipe-letter-#",
  );
});

it("sorts titles alphabetically without mutating the recipes", () => {
  const recipes = [
    recipe("z", "Ziti", 2),
    recipe("a", "  Apple Pie  ", 0),
    recipe("b", "Banana", 1),
  ];
  const original = [...recipes];

  render(<CookbookList recipes={recipes} />);

  expect(
    screen
      .getAllByRole("link")
      .filter(
        (link) =>
          link.getAttribute("href")?.startsWith("/app#/cookbook/") &&
          !link.getAttribute("href")?.endsWith("/edit"),
      )
      .map((link) => link.textContent?.trim()),
  ).toEqual(["Apple Pie", "Banana", "Ziti"]);
  expect(recipes).toEqual(original);
});

it("shows lifetime counts and local detail and edit destinations", () => {
  render(
    <CookbookList
      recipes={[
        recipe("one", "Apple Pie", 0),
        recipe("two", "Banana Bread", 1),
        recipe("three", "Carrot Soup", 3),
      ]}
    />,
  );

  expect(screen.getByText("0 made")).toBeInTheDocument();
  expect(screen.getByText("1 made")).toBeInTheDocument();
  expect(screen.getByText("3 made")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Apple Pie" })).toHaveAttribute(
    "href",
    localHref("recipe", "one"),
  );
  expect(screen.getByRole("link", { name: "Edit Apple Pie" })).toHaveAttribute(
    "href",
    localHref("edit", "one"),
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("scrolls to a letter without changing the app route hash", () => {
  window.location.hash = "#/cookbook";
  render(<CookbookList recipes={[recipe("one", "Apple Pie", 0)]} />);
  const target = screen.getByRole("heading", { name: "A" });
  const scrollIntoView = vi.fn();
  target.scrollIntoView = scrollIntoView;

  fireEvent.click(screen.getByRole("button", { name: "Jump to A" }));

  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  expect(window.location.hash).toBe("#/cookbook");
});

it("shows unavailable letters as inactive text", () => {
  render(<CookbookList recipes={[recipe("a", "Apple", 0)]} />);
  const rail = screen.getByRole("navigation", { name: "Cookbook letters" });

  expect(rail).toHaveTextContent("B");
  expect(screen.queryByRole("button", { name: "Jump to B" })).not.toBeInTheDocument();
});
