import { useRef } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet, type SheetProps } from "../Sheet";

// jsdom has no layout, so offsetParent is always null and trapTabKey would skip everything.
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent"
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
});
afterAll(() => {
  if (original)
    Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
});

function Harness({
  open,
  onClose = () => {},
}: {
  open: boolean;
  onClose?: () => void;
}) {
  const secondRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button">Trigger</button>
      <Sheet
        open={open}
        onClose={onClose}
        aria-label="Timer"
        initialFocusRef={secondRef}
      >
        <button type="button">First</button>
        <button type="button" ref={secondRef}>
          Second
        </button>
        <button type="button">Last</button>
      </Sheet>
    </>
  );
}

function renderSheet(props: Partial<SheetProps> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Sheet
      open
      onClose={onClose}
      aria-label="Ingredients"
      {...(props as object)}
    >
      <p>Body</p>
      <button type="button">Inside</button>
    </Sheet>
  );
  return { onClose, ...utils };
}

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    render(
      <Sheet open={false} onClose={() => {}} aria-label="Hidden">
        <p>Body</p>
      </Sheet>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Body")).toBeNull();
  });

  it("renders a modal dialog with an accessible name in a portal", () => {
    const { container } = renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Ingredients" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("supports aria-labelledby", () => {
    render(
      <Sheet open onClose={() => {}} aria-labelledby="sheet-title">
        <h2 id="sheet-title">Pick a recipe</h2>
      </Sheet>
    );
    expect(
      screen.getByRole("dialog", { name: "Pick a recipe" })
    ).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on panel click", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();
    await user.click(screen.getByText("Body"));
    await user.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the first focusable element when no initialFocusRef is given", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
  });

  it("honors initialFocusRef and restores focus to the trigger on close", () => {
    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByRole("button", { name: "Trigger" });
    trigger.focus();
    rerender(<Harness open />);
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();
    rerender(<Harness open={false} />);
    expect(trigger).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab within the panel", async () => {
    const user = userEvent.setup();
    render(<Harness open />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("locks body scroll while open and restores it after", () => {
    document.body.style.overflow = "scroll";
    const { rerender } = render(<Harness open />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Harness open={false} />);
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("uses the lg desktop width", () => {
    renderSheet({ size: "lg" });
    expect(screen.getByRole("dialog")).toHaveClass("md:max-w-2xl");
  });

  // The backdrop's fade is a [data-overlay-backdrop] rule in globals.css.
  it("declares CSS-only entry motion on the panel", () => {
    renderSheet();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveClass(
      "starting:translate-y-full",
      "md:starting:translate-y-2",
      "md:starting:scale-[0.98]",
      "md:starting:opacity-0"
    );
  });
});
