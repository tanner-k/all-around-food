import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimerSheet } from "../TimerSheet";

describe("TimerSheet", () => {
  it("does not render when open=false", () => {
    render(
      <TimerSheet
        open={false}
        remainingSeconds={120}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders when open=true", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={120}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders countdown text from remainingSeconds in MM:SS format", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={125}
        running={true}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("formats single-digit seconds with leading zero", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={65}
        running={true}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("shows Pause button when running", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={true}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /pause timer/i })).toBeInTheDocument();
  });

  it("shows Resume button when not running", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /resume timer/i })).toBeInTheDocument();
  });

  it("calls onPauseToggle when Pause/Resume button is clicked", () => {
    const onPauseToggle = vi.fn();
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={true}
        onPauseToggle={onPauseToggle}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /pause timer/i }));
    expect(onPauseToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when Reset button is clicked", () => {
    const onReset = vi.fn();
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={onReset}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /reset timer/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close timer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <TimerSheet
        open={true}
        remainingSeconds={60}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows 'Done!' when remainingSeconds is 0", () => {
    render(
      <TimerSheet
        open={true}
        remainingSeconds={0}
        running={false}
        onPauseToggle={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Done!")).toBeInTheDocument();
    // No pause/resume button when expired
    expect(screen.queryByRole("button", { name: /pause timer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume timer/i })).not.toBeInTheDocument();
  });
});
