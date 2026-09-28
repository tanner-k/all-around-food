import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../Card";

describe("Card", () => {
  it("renders the shared surface tokens with md padding", () => {
    render(<Card data-testid="card">Body</Card>);
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("DIV");
    for (const token of [
      "rounded-card",
      "border-line",
      "bg-paper",
      "shadow-card",
      "p-4",
    ]) {
      expect(card.className).toContain(token);
    }
    expect(card.className).not.toContain("hover:shadow-raised");
  });

  it("adds hover elevation when interactive", () => {
    render(
      <Card interactive data-testid="card">
        Body
      </Card>
    );
    expect(screen.getByTestId("card").className).toContain("hover:shadow-raised");
  });

  it("supports padding none and a semantic element", () => {
    render(
      <Card as="article" padding="none" aria-label="Recipe">
        Body
      </Card>
    );
    const card = screen.getByRole("article", { name: "Recipe" });
    expect(card.className).not.toMatch(/\bp-\d/);
  });
});
