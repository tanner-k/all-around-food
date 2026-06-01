/**
 * @vitest-environment jsdom
 *
 * Unit tests for CookView — pure component, no network or database.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CookView, type CookStep } from "./CookView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSteps = (count: number): CookStep[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `step-${i}`,
    position: i,
    text: `Step ${i + 1} text`,
  }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CookView", () => {
  it("shows the first step text initially", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    expect(screen.getByText("Step 1 text")).toBeInTheDocument();
  });

  it("shows the step counter for the first step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("disables Previous button on the first step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    const prevButton = screen.getByRole("button", { name: /previous step/i });
    expect(prevButton).toBeDisabled();
  });

  it("clicking Next advances to the second step and updates the counter", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    const nextButton = screen.getByRole("button", { name: /next step/i });
    fireEvent.click(nextButton);
    expect(screen.getByText("Step 2 text")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("Previous becomes enabled after advancing", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    const prevButton = screen.getByRole("button", { name: /previous step/i });
    expect(prevButton).not.toBeDisabled();
  });

  it("Previous returns to the previous step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    fireEvent.click(screen.getByRole("button", { name: /previous step/i }));
    expect(screen.getByText("Step 1 text")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("reaching the last step shows a Finish button", () => {
    render(<CookView title="Pasta" steps={makeSteps(2)} />);
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    expect(
      screen.getByRole("button", { name: /finish recipe/i }),
    ).toBeInTheDocument();
  });

  it("clicking Finish on the last step shows the finished state", () => {
    render(<CookView title="Pasta" steps={makeSteps(2)} />);
    // advance to last step
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    // click Finish
    fireEvent.click(screen.getByRole("button", { name: /finish recipe/i }));
    expect(screen.getByText(/enjoy your meal/i)).toBeInTheDocument();
  });

  it("finished state shows the recipe title", () => {
    render(<CookView title="My Pasta" steps={makeSteps(1)} />);
    fireEvent.click(screen.getByRole("button", { name: /finish recipe/i }));
    expect(screen.getByText("My Pasta")).toBeInTheDocument();
  });

  it("'Back to last step' button in finished state returns to the last step", () => {
    render(<CookView title="Pasta" steps={makeSteps(2)} />);
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish recipe/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to last step/i }));
    expect(screen.getByText("Step 2 text")).toBeInTheDocument();
  });

  it("renders the empty state when steps is an empty array", () => {
    render(<CookView title="Pasta" steps={[]} />);
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  it("keyboard ArrowRight advances to the next step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Step 2 text")).toBeInTheDocument();
  });

  it("keyboard ArrowLeft goes to the previous step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Step 1 text")).toBeInTheDocument();
  });

  it("Space key advances to the next step", () => {
    render(<CookView title="Pasta" steps={makeSteps(3)} />);
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Step 2 text")).toBeInTheDocument();
  });

  it("renders a progress bar with correct aria-valuenow", () => {
    render(<CookView title="Pasta" steps={makeSteps(4)} />);
    const bar = screen.getByRole("progressbar");
    // Step 1 of 4 = 25%
    expect(bar).toHaveAttribute("aria-valuenow", "25");
  });
});
