/**
 * @vitest-environment jsdom
 *
 * Light render tests for PlanView — api client is mocked; no network/db.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks — must come before component imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      plan: {
        list: vi.fn(),
        create: vi.fn(),
        remove: vi.fn(),
      },
      recipes: {
        list: vi.fn(),
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plan",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import React from "react";
import { PlanView } from "./PlanView";
import { api } from "@/lib/api";

const RECIPE = {
  id: "r-1",
  title: "Crispy Gnocchi",
  sourceUrl: null,
  createdAt: new Date().toISOString(),
};

const PLAN_ENTRY = {
  id: "mp-1",
  userId: "u-1",
  recipeId: "r-1",
  scheduledFor: "2026-06-02",
  mealType: "dinner",
  createdAt: new Date().toISOString(),
};

describe("PlanView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    vi.mocked(api.plan.list).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.recipes.list).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PlanView />);
    expect(screen.getByText(/the week/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders day columns after load", async () => {
    vi.mocked(api.plan.list).mockResolvedValue([PLAN_ENTRY]);
    vi.mocked(api.recipes.list).mockResolvedValue([RECIPE]);
    render(<PlanView />);
    await waitFor(() => {
      // At least one day-label should render
      expect(screen.getByText("Mon")).toBeInTheDocument();
    });
  });

  it("shows empty 'no recipes' state when recipe list is empty", async () => {
    vi.mocked(api.plan.list).mockResolvedValue([]);
    vi.mocked(api.recipes.list).mockResolvedValue([]);
    render(<PlanView />);
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    });
  });

  it("renders error message when api.plan.list fails", async () => {
    vi.mocked(api.plan.list).mockRejectedValue(new Error("network error"));
    vi.mocked(api.recipes.list).mockResolvedValue([]);
    render(<PlanView />);
    await waitFor(() => {
      expect(screen.getByText(/could not load plan data/i)).toBeInTheDocument();
    });
  });

  it("renders error message when api.recipes.list fails", async () => {
    vi.mocked(api.plan.list).mockResolvedValue([]);
    vi.mocked(api.recipes.list).mockRejectedValue(new Error("network error"));
    render(<PlanView />);
    await waitFor(() => {
      expect(screen.getByText(/could not load plan data/i)).toBeInTheDocument();
    });
  });
});
