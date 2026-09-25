import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MobileTabBar } from "../MobileTabBar";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("MobileTabBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#/cookbook";
  });

  it("renders five local tabs in the app shell", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<MobileTabBar />);
    expect(screen.getByText("Cookbook")).toBeInTheDocument();
    expect(screen.getByText("Pantry")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Shop")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cookbook/i })).toHaveAttribute("href", "/app#/cookbook");
  });

  it("updates active tab on hashchange and back navigation", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<MobileTabBar />);
    act(() => { window.location.hash = "#/pantry"; window.dispatchEvent(new Event("hashchange")); });
    const pantryLink = screen.getByRole("link", { name: /pantry/i });
    expect(pantryLink).toHaveAttribute("aria-current", "page");

    for (const label of ["Cookbook", "Plan", "Shop", "Import"]) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).not.toHaveAttribute("aria-current");
    }
    act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
    expect(screen.getByRole("link", { name: /cookbook/i })).toHaveAttribute("aria-current", "page");
  });

  it("returns null (renders nothing) on cook routes", () => {
    mockUsePathname.mockReturnValue("/app");
    window.location.hash = "#/cookbook/abc123/cook";
    render(<MobileTabBar />);
    expect(screen.queryByText("Cookbook")).not.toBeInTheDocument();
    expect(screen.queryByText("Pantry")).not.toBeInTheDocument();
    expect(screen.queryByText("Prices")).not.toBeInTheDocument();
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
  });
});
