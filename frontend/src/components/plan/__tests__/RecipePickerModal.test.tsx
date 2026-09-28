import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecipePickerModal, filterRecipes } from "../RecipePickerModal";

const recipes = [{ id: "a", title: "Eggs on toast" }, { id: "b", title: "Tomato soup" }, { id: "c", title: "French Toast" }];

describe("filterRecipes", () => {
  it("matches titles case-insensitively and ignores surrounding space", () => {
    expect(filterRecipes(recipes, "  TOAST ").map((recipe) => recipe.id)).toEqual(["a", "c"]);
    expect(filterRecipes(recipes, "")).toBe(recipes);
  });
});

describe("RecipePickerModal", () => {
  it("opens as a labelled dialog and picks by exact title", () => {
    const onPick = vi.fn();
    render(<RecipePickerModal recipes={recipes} dayLabel="Mon 21" onPick={onPick} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Pick a recipe" })).toBeInTheDocument();
    expect(screen.getByText("Adding to Mon 21.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eggs on toast" }));
    expect(onPick).toHaveBeenCalledWith("a");
  });

  it("filters rows by the search query and reports no matches", () => {
    render(<RecipePickerModal recipes={recipes} onPick={() => {}} onClose={() => {}} />);
    const search = screen.getByRole("searchbox", { name: "Search recipes" });
    fireEvent.change(search, { target: { value: "soup" } });
    expect(screen.getByRole("button", { name: "Tomato soup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eggs on toast" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "pizza" } });
    expect(screen.getByRole("status")).toHaveTextContent("No recipes match “pizza”.");
  });

  it("closes on Escape and from the close button", () => {
    const onClose = vi.fn();
    render(<RecipePickerModal recipes={recipes} onPick={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the empty library state without a search field", () => {
    render(<RecipePickerModal recipes={[]} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText("No saved recipes yet.")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
