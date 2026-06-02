import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IngredientsSheet } from "../IngredientsSheet";
import type { Ingredient } from "@/lib/recipe-schema";

const INGREDIENTS: Ingredient[] = [
  {
    name: "flour",
    quantity: { value: 2, unit: "cups", as_written: "2 cups" },
    preparation: null,
    optional: false,
    group: null,
    notes: null,
  },
  {
    name: "sugar",
    quantity: { value: 1, unit: "cup", as_written: "1 cup" },
    preparation: null,
    optional: false,
    group: null,
    notes: null,
  },
  {
    name: "butter",
    quantity: { value: null, unit: null, as_written: "" },
    preparation: null,
    optional: false,
    group: null,
    notes: null,
  },
];

describe("IngredientsSheet", () => {
  it("renders when open=true", () => {
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <IngredientsSheet
        open={false}
        ingredients={INGREDIENTS}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={onClose}
      />
    );
    // The backdrop is the element with aria-hidden="true" before the dialog
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close ingredients/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders provided ingredients", () => {
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("flour")).toBeInTheDocument();
    expect(screen.getByText("sugar")).toBeInTheDocument();
    expect(screen.getByText("butter")).toBeInTheDocument();
  });

  it("renders ingredient quantities when present", () => {
    render(
      <IngredientsSheet
        open={true}
        ingredients={INGREDIENTS}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("2 cups")).toBeInTheDocument();
    expect(screen.getByText("1 cup")).toBeInTheDocument();
  });
});
