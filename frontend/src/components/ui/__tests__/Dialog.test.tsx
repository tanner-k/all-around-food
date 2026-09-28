import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, type DialogProps } from "../Dialog";

function renderDialog(props: Partial<DialogProps> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <Dialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete recipe?"
      description="This cannot be undone."
      confirmLabel="Delete"
      {...props}
    />
  );
  return { onClose, onConfirm };
}

describe("Dialog", () => {
  it("is named by its title and described by its description", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Delete recipe?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(
      screen.getByRole("heading", { level: 2, name: "Delete recipe?" })
    ).toBeInTheDocument();
  });

  it("omits aria-describedby without a description", () => {
    renderDialog({ description: undefined });
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("focuses Cancel on open", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onConfirm and onClose from its buttons", async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog({ cancelLabel: "Keep" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the primary variant by default", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-terra"
    );
  });

  it("uses bg-danger for the danger variant", () => {
    renderDialog({ variant: "danger" });
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-danger"
    );
  });

  it("disables both buttons and ignores Escape and backdrop while busy", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("fades and scales in with CSS-only entry motion", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toHaveClass(
      "starting:opacity-0",
      "starting:scale-[0.96]"
    );
  });
});
