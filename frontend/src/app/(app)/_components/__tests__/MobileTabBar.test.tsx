import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTabBar } from "../MobileTabBar";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("MobileTabBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders three tabs when pathname is /cookbook", () => {
    mockUsePathname.mockReturnValue("/cookbook");
    render(<MobileTabBar />);
    expect(screen.getByText("Cookbook")).toBeInTheDocument();
    expect(screen.getByText("Pantry")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
  });

  it("marks only the active tab with aria-current='page'", () => {
    mockUsePathname.mockReturnValue("/pantry");
    render(<MobileTabBar />);
    const pantryLink = screen.getByRole("link", { name: /pantry/i });
    expect(pantryLink).toHaveAttribute("aria-current", "page");

    for (const label of ["Cookbook", "Import"]) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("returns null (renders nothing) on cook routes", () => {
    mockUsePathname.mockReturnValue("/cookbook/abc123/cook");
    render(<MobileTabBar />);
    expect(screen.queryByText("Cookbook")).not.toBeInTheDocument();
    expect(screen.queryByText("Pantry")).not.toBeInTheDocument();
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
  });
});
