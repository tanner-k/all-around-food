import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CheckboxButton } from "../CheckboxButton";

function Labelled({ onChange }: { onChange: (next: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <label>
      <CheckboxButton
        size="sm"
        aria-labelledby="confirm-text"
        checked={checked}
        onChange={(next) => {
          onChange(next);
          setChecked(next);
        }}
      />
      <span id="confirm-text">I saved my backup</span>
    </label>
  );
}

describe("CheckboxButton", () => {
  it("renders a checkbox role with aria-checked and its accessible name", () => {
    render(<CheckboxButton aria-label="eggs" checked={false} onChange={() => undefined} />);
    const box = screen.getByRole("checkbox", { name: "eggs" });
    expect(box.tagName).toBe("BUTTON");
    expect(box).toHaveAttribute("type", "button");
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(box).not.toBeChecked();
  });

  it("reports checked state and draws the check", () => {
    const { container } = render(
      <CheckboxButton aria-label="eggs" checked onChange={() => undefined} />
    );
    expect(screen.getByRole("checkbox", { name: "eggs" })).toBeChecked();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("calls onChange with the next value", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CheckboxButton aria-label="eggs" checked={false} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<CheckboxButton aria-label="eggs" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("does not fire onChange when disabled", () => {
    const onChange = vi.fn();
    render(<CheckboxButton aria-label="eggs" checked={false} disabled onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "eggs" });
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a 44px hit area and a focus-visible ring at the compact size", () => {
    render(<CheckboxButton aria-label="eggs" size="sm" checked={false} onChange={() => undefined} />);
    const box = screen.getByRole("checkbox");
    expect(box.className).toContain("size-11");
    expect(box.className).toContain("focus-visible:outline-focus");
    expect(box.querySelector("[data-checkbox-box]")?.className).toContain("size-5");
  });

  it("uses aria-labelledby text and toggles once from the button or the label text", () => {
    const onChange = vi.fn();
    render(<Labelled onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "I saved my backup" });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(box).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByText("I saved my backup"));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(box).toHaveAttribute("aria-checked", "false");
  });
});
