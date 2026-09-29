import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlannedRecipeCard, stepServings } from "../PlannedRecipeCard";

function renderCard(servings: number | null, baseServings: number | null = 2) {
  const onServingsChange = vi.fn();
  const onRemove = vi.fn();
  render(<PlannedRecipeCard recipeTitle="Toast" servings={servings} baseServings={baseServings} onServingsChange={onServingsChange} onRemove={onRemove} />);
  return { onServingsChange, onRemove };
}

describe("stepServings", () => {
  it("steps whole servings and never goes below a half", () => {
    expect(stepServings(2, 1)).toBe(3);
    expect(stepServings(2, -1)).toBe(1);
    expect(stepServings(1, -1)).toBe(0.5);
    expect(stepServings(1.5, -1)).toBe(0.5);
    expect(stepServings(null, 1)).toBe(1);
  });
});

describe("PlannedRecipeCard", () => {
  it("keeps the spinbutton name and value contract", () => {
    const { onServingsChange } = renderCard(null);
    const input = screen.getByRole("spinbutton", { name: "Toast servings" });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("placeholder", "2");
    fireEvent.change(input, { target: { value: "3.5" } });
    expect(onServingsChange).toHaveBeenLastCalledWith(3.5);
  });

  it("clears back to the recipe's servings with an empty value", () => {
    const { onServingsChange } = renderCard(3);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Toast servings" }), { target: { value: "" } });
    expect(onServingsChange).toHaveBeenLastCalledWith(null);
  });

  it("steps from the recipe's base servings when none are set", () => {
    const { onServingsChange } = renderCard(null, 4);
    fireEvent.click(screen.getByRole("button", { name: "Increase Toast servings" }));
    expect(onServingsChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Toast servings" }));
    expect(onServingsChange).toHaveBeenLastCalledWith(3);
  });

  it("disables decrease at the minimum", () => {
    renderCard(0.5);
    expect(screen.getByRole("button", { name: "Decrease Toast servings" })).toBeDisabled();
  });

  it("removes through a 44px icon button with the same name", () => {
    const { onRemove } = renderCard(2);
    const remove = screen.getByRole("button", { name: "Remove Toast" });
    expect(remove).toHaveClass("size-11");
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
