import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppHeader, AppMain } from "../AppHeader";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

function goToHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event("hashchange"));
  });
}

describe("AppHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#/plan";
  });

  it("renders the brand, status slot, Settings link, and add/import menu", () => {
    mockUsePathname.mockReturnValue("/app");
    const { container } = render(<AppHeader />);
    expect(screen.getByRole("link", { name: "All Around Food" })).toHaveAttribute("href", "/app#/plan");
    expect(container.querySelector("#app-header-status")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/app#/settings");
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");

    const trigger = screen.getByRole("button", { name: "Add or import a recipe" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Add recipe" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Import recipe" })).toBeInTheDocument();
  });

  it("marks recipe routes as Cookbook and Settings as current on settings", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<AppHeader />);
    goToHash("#/cookbook/abc");
    expect(screen.getByRole("link", { name: "Cookbook" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute("aria-current");
    goToHash("#/settings");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cookbook" })).not.toHaveAttribute("aria-current");
  });

  it("hides on cook routes without replacing the status slot node", () => {
    mockUsePathname.mockReturnValue("/app");
    const { container } = render(<AppHeader />);
    const header = container.querySelector("header")!;
    const slot = document.getElementById("app-header-status");
    expect(header).not.toHaveAttribute("hidden");

    goToHash("#/cookbook/abc123/cook");
    expect(container.querySelector("header")).toHaveAttribute("hidden");
    expect(document.getElementById("app-header-status")).toBe(slot);
    expect(slot).toBeInTheDocument();

    goToHash("#/shop");
    expect(container.querySelector("header")).not.toHaveAttribute("hidden");
    expect(document.getElementById("app-header-status")).toBe(slot);
  });

  it("treats the legacy /cookbook/:id/cook pathname as cook mode", () => {
    mockUsePathname.mockReturnValue("/cookbook/abc/cook");
    window.location.hash = "";
    const { container } = render(<AppHeader />);
    expect(container.querySelector("header")).toHaveAttribute("hidden");
  });
});

describe("AppMain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#/plan";
  });

  it("uses page padding off cook routes and edge-to-edge on cook routes", () => {
    mockUsePathname.mockReturnValue("/app");
    render(<AppMain>content</AppMain>);
    const main = screen.getByRole("main");
    expect(main).toHaveClass("max-w-[1400px]", "px-4", "pb-[calc(var(--tabbar-height)+1.5rem)]");
    expect(main).not.toHaveClass("p-0");

    goToHash("#/cookbook/abc123/cook");
    expect(main).toHaveClass("p-0", "max-w-none");
    expect(main).not.toHaveClass("max-w-[1400px]");

    goToHash("#/pantry");
    expect(main).toHaveClass("max-w-[1400px]");
  });

  it("is edge-to-edge on the legacy /cookbook/:id/cook pathname", () => {
    mockUsePathname.mockReturnValue("/cookbook/abc/cook");
    window.location.hash = "";
    render(<AppMain>content</AppMain>);
    expect(screen.getByRole("main")).toHaveClass("p-0", "max-w-none");
  });
});
