import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Overlay } from "../internal/Overlay";

describe("Overlay", () => {
  it("focuses the panel itself when it has no focusable content", () => {
    render(
      <Overlay open onClose={() => {}} aria-label="Empty">
        <p>Nothing to focus</p>
      </Overlay>
    );
    expect(screen.getByRole("dialog", { name: "Empty" })).toHaveFocus();
  });

  it("only lets the topmost of stacked overlays handle Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Overlay open onClose={outer} aria-label="Outer">
          <p>Outer</p>
        </Overlay>
        <Overlay open onClose={inner} aria-label="Inner">
          <p>Inner</p>
        </Overlay>
      </>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("calls the latest onClose without refocusing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Overlay open onClose={first} aria-label="O">
        <button type="button">A</button>
        <button type="button">B</button>
      </Overlay>
    );
    const b = screen.getByRole("button", { name: "B" });
    b.focus();
    rerender(
      <Overlay open onClose={second} aria-label="O">
        <button type="button">A</button>
        <button type="button">B</button>
      </Overlay>
    );
    expect(b).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
