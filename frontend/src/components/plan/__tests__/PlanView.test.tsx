import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { currentMonday } from "@/lib/week";
import type { MealPlan } from "@/lib/meal-plan-schema";
import { PlanView } from "../PlanView";

const recipes = [{ id: "r1", title: "Toast", servings: 2 }];
const noop = () => Promise.resolve();

function renderPlan(weekOf: string, meals: MealPlan["meals"] = []) {
  const onGenerate = vi.fn(noop);
  render(<PlanView weekOf={weekOf} initialPlan={{ week_of: weekOf, meals, updated_at: "2026-09-21T00:00:00Z" }} recipes={recipes}
    onAdd={noop} onRemove={noop} onServingsChange={noop} onGenerate={onGenerate} />);
  return { onGenerate };
}

afterEach(() => { window.location.hash = ""; });

describe("PlanView", () => {
  it("shows an outline, disabled Review shopping before any meals exist", () => {
    renderPlan("2026-09-21");
    const cta = screen.getByRole("button", { name: "Review shopping →" });
    expect(cta).toBeDisabled();
    expect(cta).toHaveClass("border-line-strong");
    expect(cta).toHaveAccessibleDescription("Add a recipe to any day to build a shopping list.");
    expect(screen.getAllByRole("button", { name: "+ Add recipe" })).toHaveLength(7);
  });

  it("enables a sticky Review shopping once meals exist", () => {
    renderPlan("2026-09-21", [{ id: "m1", recipe_id: "r1", day_index: 2, servings: null }]);
    const cta = screen.getByRole("button", { name: "Review shopping →" });
    expect(cta).toBeEnabled();
    expect(cta).toHaveClass("bg-terra");
    expect(cta.closest(".sticky")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "+ Add recipe" })).toHaveLength(7);
    expect(screen.getByText("1 recipe across 1 day")).toBeInTheDocument();
  });

  it("navigates weeks with icon buttons and offers a jump back to this week", () => {
    renderPlan("2026-09-21");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(window.location.hash).toBe("#/plan?weekOf=2026-09-28");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(window.location.hash).toBe("#/plan?weekOf=2026-09-14");
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", `/app#/plan?weekOf=${currentMonday()}`);
  });

  it("hides the jump on the current week and marks today", () => {
    renderPlan(currentMonday());
    expect(screen.queryByRole("link", { name: "This week" })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it("opens the picker for the chosen day", () => {
    renderPlan("2026-09-21");
    fireEvent.click(screen.getAllByRole("button", { name: "+ Add recipe" })[2]);
    expect(screen.getByRole("dialog", { name: "Pick a recipe" })).toBeInTheDocument();
    expect(screen.getByText("Adding to Wed 23.")).toBeInTheDocument();
  });
});
