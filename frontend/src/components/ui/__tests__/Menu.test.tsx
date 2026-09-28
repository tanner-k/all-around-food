import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu, type MenuItem } from "../Menu";

function setup(items?: MenuItem[]) {
  const edit = vi.fn();
  const remove = vi.fn();
  const archive = vi.fn();
  const menuItems: MenuItem[] = items ?? [
    { label: "Edit", onSelect: edit },
    { label: "Archive", onSelect: archive, disabled: true },
    { label: "Delete", onSelect: remove, danger: true },
  ];
  render(
    <div>
      <p>Outside</p>
      <Menu label="Recipe actions" items={menuItems} />
    </div>
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Recipe actions" });
  return { user, trigger, edit, remove, archive };
}

describe("Menu", () => {
  it("is closed by default", () => {
    const { trigger } = setup();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
  });

  it("toggles aria-expanded and wires aria-controls", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click and focuses the first enabled item", async () => {
    const { user, trigger } = setup([
      { label: "Nope", onSelect: vi.fn(), disabled: true },
      { label: "Edit", onSelect: vi.fn() },
    ]);
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
  });

  it("calls onSelect, closes, and refocuses the trigger", async () => {
    const { user, trigger, edit } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("does not call onSelect for disabled items", async () => {
    const { user, trigger, archive } = setup();
    await user.click(trigger);
    const item = screen.getByRole("menuitem", { name: "Archive" });
    expect(item).toBeDisabled();
    await user.click(item);
    expect(archive).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape and refocuses the trigger", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on an outside click", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("styles danger items with the danger token", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass(
      "text-danger"
    );
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveClass(
      "text-ink"
    );
  });
});
