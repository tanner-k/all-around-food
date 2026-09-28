import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "@/lib/theme-preference";
import { ThemeSettings } from "../ThemeSettings";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
});
afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it("renders Light, Dark, and System in a labelled radiogroup, defaulting to System", () => {
  render(<ThemeSettings />);
  const group = screen.getByRole("radiogroup", { name: "Appearance" });
  expect(group).toBeInTheDocument();
  expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Light", "Dark", "System"]);
  expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("tabindex", "-1");
});

it("reflects the stored preference", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  render(<ThemeSettings />);
  expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
});

it("clicking Dark stores the choice and applies data-theme", () => {
  render(<ThemeSettings />);
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
});

it("arrow keys move the selection and focus with wraparound", () => {
  render(<ThemeSettings />);
  const system = screen.getByRole("radio", { name: "System" });
  system.focus();
  fireEvent.keyDown(system, { key: "ArrowRight" });
  const light = screen.getByRole("radio", { name: "Light" });
  expect(light).toHaveAttribute("aria-checked", "true");
  expect(light).toHaveFocus();
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.keyDown(light, { key: "ArrowDown" });
  expect(screen.getByRole("radio", { name: "Dark" })).toHaveFocus();
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowLeft" });
  expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "End" });
  expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
});
