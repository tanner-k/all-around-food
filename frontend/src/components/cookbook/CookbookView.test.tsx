/**
 * @vitest-environment jsdom
 *
 * Smoke tests for CookbookView — api client is mocked; no network/db.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock the api client before importing the component
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      recipes: {
        list: vi.fn(),
      },
    },
  };
});

// Mock next/navigation (useRouter is used in RecipeCard links)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/cookbook",
  useSearchParams: () => new URLSearchParams(),
}));

import { CookbookView } from "./CookbookView";
import { api } from "@/lib/api";

const mockRecipes = [
  {
    id: "r1",
    title: "Crispy Gnocchi",
    sourceUrl: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "r2",
    title: "Weeknight Pasta",
    sourceUrl: "https://example.com",
    createdAt: new Date(Date.now() - 1000).toISOString(),
  },
];

describe("CookbookView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    vi.mocked(api.recipes.list).mockReturnValue(new Promise(() => {}));
    const { container } = render(<CookbookView />);
    // SectionHeader scene label is always visible immediately
    expect(screen.getByText(/your library/i)).toBeInTheDocument();
    // Loading skeletons should be present
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders recipe titles after load", async () => {
    vi.mocked(api.recipes.list).mockResolvedValue(mockRecipes);
    render(<CookbookView />);
    await waitFor(() => {
      expect(screen.getByText("Crispy Gnocchi")).toBeInTheDocument();
      expect(screen.getByText("Weeknight Pasta")).toBeInTheDocument();
    });
  });

  it("shows recipe count", async () => {
    vi.mocked(api.recipes.list).mockResolvedValue(mockRecipes);
    render(<CookbookView />);
    await waitFor(() => {
      expect(screen.getByText("2 recipes")).toBeInTheDocument();
    });
  });

  it("renders empty state when there are no recipes", async () => {
    vi.mocked(api.recipes.list).mockResolvedValue([]);
    render(<CookbookView />);
    await waitFor(() => {
      expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    });
  });

  it("renders an error state when the api call fails", async () => {
    vi.mocked(api.recipes.list).mockRejectedValue(new Error("network error"));
    render(<CookbookView />);
    await waitFor(() => {
      expect(screen.getByText(/could not load recipes/i)).toBeInTheDocument();
    });
  });
});
