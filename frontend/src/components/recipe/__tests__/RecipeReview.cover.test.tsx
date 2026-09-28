import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RecipeReview } from "../RecipeReview";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";

it("renders the generated cover as the review hero", () => {
  const { container } = render(<RecipeReview recipe={{ ...recipeFixture(), title: "Miso Soup" }} onSave={() => {}} />);
  const covers = container.querySelectorAll("[data-recipe-cover]");
  expect(covers).toHaveLength(1);
  expect(covers[0]).toHaveClass("aspect-video");
  expect(covers[0]).toHaveTextContent("M");
  expect(container.querySelector(".aspect-video.bg-paper-2")).toBeNull();
});
