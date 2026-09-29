import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { Recipe } from "@/lib/recipe-schema";
import { RecipeDetail } from "../RecipeDetail";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return { ...recipeFixture(), ...overrides };
}

function renderDetail(value: Recipe, handlers: Partial<{ onDelete: () => Promise<void>; onStartCook: () => Promise<void> }> = {}) {
  const props = {
    onMarkCooked: vi.fn(async () => {}),
    onDelete: vi.fn(handlers.onDelete ?? (async () => {})),
    onStartCook: vi.fn(handlers.onStartCook ?? (async () => {})),
  };
  render(<RecipeDetail recipe={value} {...props} />);
  return props;
}

describe("RecipeDetail", () => {
  it("renders parsed quantities in the amount column and falls back to as_written", () => {
    renderDetail(recipe({
      ingredients: [
        { name: "crushed tomatoes", quantity: { value: 28, unit: "oz", as_written: "28 oz crushed tomatoes" }, preparation: null, optional: false, group: null, notes: null },
        { name: "salt", quantity: { value: null, unit: null, as_written: "to taste" }, preparation: null, optional: true, group: null, notes: null },
        { name: "onion", quantity: { value: 1, unit: null, as_written: "1 onion" }, preparation: "diced", optional: false, group: null, notes: null },
      ],
    }));
    const list = screen.getByText("Ingredients").parentElement!;
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/^28 ozcrushed tomatoes$/);
    expect(within(rows[0]).queryByText(/28 oz crushed tomatoes/)).not.toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(/^to tastesaltoptional$/);
    expect(rows[2]).toHaveTextContent(/^1onion, diced$/);
  });

  it("shows total time once, in the breadcrumb when there is a course", () => {
    renderDetail(recipe({ course: "main", total_time_min: 45 }));
    expect(screen.getAllByText(/45 min/)).toHaveLength(1);
    expect(screen.getByText("main · 45 min")).toBeInTheDocument();
  });

  it("keeps time in the breadcrumb when there is no course", () => {
    renderDetail(recipe({ course: null, total_time_min: 45 }));
    expect(screen.getAllByText(/45 min/)).toHaveLength(1);
    expect(screen.getByText("45 min").tagName).toBe("P");
  });

  it("keeps one primary action and moves Edit and Delete into the options menu", async () => {
    const props = renderDetail(recipe());
    expect(screen.getByRole("link", { name: "Start cooking" })).toHaveAttribute("href", expect.stringContaining("/cook"));
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recipe options" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: "Delete recipe?" });
    expect(dialog).toHaveTextContent("Delete “Toast” from your cookbook?");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
  });

  it("does not delete when the dialog is cancelled", () => {
    const props = renderDetail(recipe());
    fireEvent.click(screen.getByRole("button", { name: "Recipe options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("closes the dialog and reports a failed deletion", async () => {
    renderDetail(recipe(), { onDelete: async () => { throw new Error("Account changed"); } });
    fireEvent.click(screen.getByRole("button", { name: "Recipe options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Account changed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders step amounts as a light annotation, not a chip", () => {
    renderDetail(recipe({
      ingredients: [{ name: "garlic", quantity: { value: 4, unit: "clove", as_written: "4 cloves garlic" }, preparation: null, optional: false, group: null, notes: null }],
      steps: [{ order: 1, instruction: "Slice the garlic.", duration_min: null, temperature_f: null, equipment: [], inline_amounts: [] }],
    }));
    const steps = screen.getAllByText("Steps").at(-1)!.parentElement!;
    const amount = within(steps).getByText("4 cloves");
    expect(amount.className).not.toMatch(/bg-terra-soft/);
    expect(steps).not.toHaveTextContent("4 cloves garlic");
  });
});
