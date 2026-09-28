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

  it("renders exactly the four destination tabs in the app shell", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<MobileTabBar />);
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(nav).toHaveAttribute("data-mobile-tabbar");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.textContent)).toEqual(["Plan", "Cookbook", "Shop", "Pantry"]);
    expect(screen.getByRole("link", { name: /cookbook/i })).toHaveAttribute("href", "/app#/cookbook");
    expect(screen.queryByRole("link", { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("updates active tab on hashchange and back navigation", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<MobileTabBar />);
    act(() => { window.location.hash = "#/pantry"; window.dispatchEvent(new Event("hashchange")); });
    const pantryLink = screen.getByRole("link", { name: /pantry/i });
    expect(pantryLink).toHaveAttribute("aria-current", "page");

    for (const label of ["Cookbook", "Plan", "Shop"]) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).not.toHaveAttribute("aria-current");
    }
    act(() => { window.location.hash = "#/cookbook"; window.dispatchEvent(new Event("hashchange")); });
    expect(screen.getByRole("link", { name: /cookbook/i })).toHaveAttribute("aria-current", "page");
  });

  it("returns null (renders nothing) on cook routes", () => {
    mockUsePathname.mockReturnValue("/app");
    window.location.hash = "#/cookbook/abc123/cook";
    const { container } = render(<MobileTabBar />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Cookbook")).not.toBeInTheDocument();
  });

  it("renders nothing outside the /app shell", () => {
    mockUsePathname.mockReturnValue("/login");
    const { container } = render(<MobileTabBar />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
