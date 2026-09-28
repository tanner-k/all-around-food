import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IconButton } from "../IconButton";

describe("IconButton", () => {
  it("uses aria-label as its accessible name and hides the icon", () => {
    render(<IconButton aria-label="Close timer" icon={<svg data-testid="icon" />} />);
    const button = screen.getByRole("button", { name: "Close timer" });
    expect(button).toHaveAttribute("type", "button");
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("has a 44×44 minimum hit area", () => {
    render(<IconButton aria-label="More" icon="⋯" />);
    expect(screen.getByRole("button").className).toContain("size-11");
  });

  it("applies the default (bordered) variant", () => {
    render(<IconButton aria-label="More" icon="⋯" variant="default" />);
    expect(screen.getByRole("button").className).toContain("border-line");
  });

  it("forwards clicks and refs", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} aria-label="More" icon="⋯" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole("button"));
  });
});
