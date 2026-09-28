import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CookbookSkeleton } from "../CookbookSkeleton";
import { RecipeDetailSkeleton } from "../RecipeDetailSkeleton";

it.each([
  ["cookbook", CookbookSkeleton, "Loading cookbook"],
  ["recipe detail", RecipeDetailSkeleton, "Loading recipe"],
])("renders the %s skeleton as a named status without a snapshot", (_, Skeleton, name) => {
  render(<Skeleton />);
  const status = screen.getByRole("status", { name });
  expect(status).toHaveTextContent("Opening your local cookbook…");
  expect(screen.getByText("Opening your local cookbook…")).toHaveClass("sr-only");
  expect(status.querySelector("[aria-hidden='true']")).toHaveClass("motion-safe:animate-pulse");
});
