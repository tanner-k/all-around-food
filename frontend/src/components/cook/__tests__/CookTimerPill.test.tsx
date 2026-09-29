import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CookTimerPill } from "../CookTimerPill";

function setup(props: Partial<Parameters<typeof CookTimerPill>[0]> = {}) {
  const handlers = { onOpen: vi.fn(), onPause: vi.fn(), onReset: vi.fn() };
  const utils = render(
    <CookTimerPill secondsLeft={125} running variant="desktop" {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
}

describe("CookTimerPill", () => {
  it("renders nothing when no timer is set", () => {
    const { container } = setup({ secondsLeft: -1 });
    expect(container).toBeEmptyDOMElement();
    const mobile = setup({ secondsLeft: -5, variant: "mobile" });
    expect(mobile.container).toBeEmptyDOMElement();
  });

  it("formats the remaining time with tabular digits", () => {
    setup({ secondsLeft: 125 });
    const digits = screen.getByText("02:05");
    expect(digits).toHaveClass("tabular-nums");
  });

  it("shows Time's up at zero with no pause/resume control on desktop", () => {
    setup({ secondsLeft: 0 });
    expect(screen.getByText("Time's up")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause timer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume timer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset timer" })).toBeInTheDocument();
  });

  it("renders a single Open timer button on mobile", () => {
    const { onOpen } = setup({ variant: "mobile" });
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Open timer");
    expect(buttons[0]).toHaveAttribute("title", "02:05");
    expect(screen.queryByRole("button", { name: "Pause timer" })).toBeNull();
    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles the pause/resume label by running and calls onPause", () => {
    const { onPause, rerender } = setup({ running: true });
    expect(screen.getByRole("group", { name: "Timer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(onPause).toHaveBeenCalledTimes(1);

    rerender(
      <CookTimerPill
        secondsLeft={125}
        running={false}
        variant="desktop"
        onPause={onPause}
        onReset={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Pause timer" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume timer" }));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it("calls onReset from the reset button", () => {
    const { onReset } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reset timer" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
