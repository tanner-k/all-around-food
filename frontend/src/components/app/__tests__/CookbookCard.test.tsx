import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CookbookCard, cookbookMeta } from "../CookbookCard";
import { LocalScreens } from "../LocalScreens";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { LibrarySnapshot } from "@/lib/local/schema";

afterEach(cleanup);

const recipe = { ...recipeFixture(), title: "Carrot Soup", cuisine: "French", total_time_min: 45, cook_time_min: 30, servings: 4, description: "Silky, sweet and bright." };

describe("cookbookMeta", () => {
  it("joins cuisine, total time and servings", () => {
    expect(cookbookMeta(recipe)).toBe("French · 45 min · serves 4");
  });
  it("falls back to cook time and skips missing fields", () => {
    expect(cookbookMeta({ ...recipe, total_time_min: null })).toBe("French · 30 min · serves 4");
    expect(cookbookMeta({ cuisine: null, total_time_min: null, cook_time_min: null, servings: 2 })).toBe("serves 2");
    expect(cookbookMeta({ cuisine: " ", total_time_min: null, cook_time_min: null, servings: null })).toBe("");
  });
});

describe("CookbookCard", () => {
  function renderCard(props: Parameters<typeof CookbookCard>[0]) {
    return render(<ul><CookbookCard {...props} /></ul>);
  }

  it("links the whole card to the recipe with cover, meta, description and cooked count", () => {
    const { container } = renderCard({ recipe: { ...recipe, times_made: 3 } });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/app#/cookbook/recipe-1");
    expect(within(link).getByText("Carrot Soup")).toBeInTheDocument();
    expect(within(link).getByText("French · 45 min · serves 4")).toBeInTheDocument();
    expect(within(link).getByText("Silky, sweet and bright.")).toHaveClass("italic", "line-clamp-2");
    expect(within(link).getByText("3× cooked")).toBeInTheDocument();
    expect(container.querySelector("[data-recipe-cover]")).toHaveClass("aspect-video");
    expect(container.querySelector("li")).toHaveClass("rounded-card", "shadow-card");
  });

  it("omits the description and meta when absent and keeps the just-added copy", () => {
    renderCard({ recipe: { ...recipe, description: null, cuisine: null, total_time_min: null, cook_time_min: null, servings: null, times_made: 0 } });
    const link = screen.getByRole("link");
    expect(link.querySelectorAll("p")).toHaveLength(2);
    expect(within(link).getByText("just added")).toBeInTheDocument();
  });

  it("highlights only the featured card", () => {
    const { container } = render(<ul><CookbookCard recipe={recipe} featured /><CookbookCard recipe={{ ...recipe, id: "recipe-2" }} /></ul>);
    const [first, second] = container.querySelectorAll("li");
    expect(first).toHaveClass("ring-terra");
    expect(second).not.toHaveClass("ring-terra");
  });
});

it("renders the cookbook as a list of cards with no empty placeholder", () => {
  const snapshot: LibrarySnapshot = { recipes: [recipe, { ...recipe, id: "recipe-2", title: "Toast", times_made: 5 }], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] };
  const { container } = render(<LocalScreens route={{ view: "cookbook" }} snapshot={snapshot} />);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("Toast");
  expect(items[0]).toHaveTextContent("5× cooked");
  expect(items[0]).toHaveClass("ring-terra");
  expect(container.querySelector(".aspect-video.bg-paper-2")).toBeNull();
  expect(container.querySelectorAll("[data-recipe-cover]")).toHaveLength(2);
});
