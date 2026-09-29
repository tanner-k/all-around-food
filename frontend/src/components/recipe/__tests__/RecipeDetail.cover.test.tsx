import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecipeDetail } from "../RecipeDetail";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";

// Hero-only coverage; plan 05 owns the rest of RecipeDetail and its tests.
it("renders the generated cover in the 16:10 hero instead of an empty block", () => {
  const recipe = { ...recipeFixture(), title: "Carrot Soup", cuisine: "French" };
  const { container } = render(<RecipeDetail recipe={recipe} onMarkCooked={async () => {}} onDelete={async () => {}} onStartCook={async () => {}} />);
  const covers = container.querySelectorAll("[data-recipe-cover]");
  expect(covers).toHaveLength(1);
  expect(covers[0].className).toContain("aspect-[16/10]");
  expect(covers[0]).toHaveTextContent("C");
  expect(container.querySelector(".bg-paper-2[style]")).toBeNull();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Carrot Soup");
});
