import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../Button";

describe("Button", () => {
  it("renders a primary md button by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("bg-terra");
    expect(button.className).toContain("hover:bg-terra-strong");
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("rounded-full");
  });

  it.each([
    ["secondary", "border-line-strong"],
    ["ghost", "hover:bg-paper-2"],
    ["danger", "bg-danger"],
  ] as const)("applies the %s variant", (variant, expected) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button").className).toContain(expected);
  });

  it.each([
    ["sm", "min-h-9"],
    ["md", "min-h-11"],
    ["lg", "min-h-14"],
  ] as const)("applies the %s size", (size, expected) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole("button").className).toContain(expected);
  });

  it("renders an anchor when href is set", () => {
    render(<Button href="/app#/cookbook/new">+ Add recipe</Button>);
    const link = screen.getByRole("link", { name: "+ Add recipe" });
    expect(link).toHaveAttribute("href", "/app#/cookbook/new");
    expect(link.className).toContain("bg-terra");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("forwards type and click handlers", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" onClick={onClick}>
        Submit
      </Button>
    );
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toHaveAttribute("type", "submit");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire clicks when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables and marks busy while loading, keeping its label", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving…
      </Button>
    );
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("appends layout classes and supports fullWidth", () => {
    render(
      <Button fullWidth className="sm:ml-auto">
        Go
      </Button>
    );
    const { className } = screen.getByRole("button");
    expect(className).toContain("w-full");
    expect(className).toContain("sm:ml-auto");
  });

  it("adds press feedback that skips disabled states, on buttons and links", () => {
    render(
      <>
        <Button>Press</Button>
        <Button href="/app">Link</Button>
      </>
    );
    for (const el of [
      screen.getByRole("button", { name: "Press" }),
      screen.getByRole("link", { name: "Link" }),
    ]) {
      expect(el.className).toContain(
        "not-disabled:not-aria-disabled:active:scale-[0.98]"
      );
      expect(el.className).toContain(
        "transition-[color,background-color,border-color,scale]"
      );
      expect(el.className).toContain("duration-(--duration-fast)");
      expect(el.className).toContain("ease-(--ease-out-soft)");
      expect(el.className).not.toMatch(/(^|\s)active:scale-/);
    }
  });
});
