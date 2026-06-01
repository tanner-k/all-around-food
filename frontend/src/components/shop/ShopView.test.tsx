/**
 * @vitest-environment jsdom
 *
 * Light render tests for ShopView — api client is mocked; no network/db.
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
      shop: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/shop",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import React from "react";
import { ShopView } from "./ShopView";
import { api } from "@/lib/api";

const SHOP_ITEM = {
  id: "si-1",
  userId: "u-1",
  name: "pasta",
  amount: 200,
  unit: "g",
  checked: false,
  recipeId: "r-1",
  createdAt: new Date().toISOString(),
};

describe("ShopView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    vi.mocked(api.shop.list).mockReturnValue(new Promise(() => {}));
    const { container } = render(<ShopView />);
    // SectionHeader renders "SHOPPING" (scene label) — use getAllByText for the section header
    expect(screen.getAllByText(/shopping/i).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders shopping items after load", async () => {
    vi.mocked(api.shop.list).mockResolvedValue([SHOP_ITEM]);
    render(<ShopView />);
    await waitFor(() => {
      expect(screen.getByText("pasta")).toBeInTheDocument();
    });
  });

  it("shows empty state when list is empty", async () => {
    vi.mocked(api.shop.list).mockResolvedValue([]);
    render(<ShopView />);
    await waitFor(() => {
      // EmptyState renders "List is empty" as a heading — both the header <p> and EmptyState title match
      expect(screen.getAllByText(/list is empty/i).length).toBeGreaterThan(0);
    });
  });

  it("renders error message when api.shop.list fails", async () => {
    vi.mocked(api.shop.list).mockRejectedValue(new Error("network error"));
    render(<ShopView />);
    await waitFor(() => {
      expect(screen.getByText(/could not load shopping list/i)).toBeInTheDocument();
    });
  });

  it("shows item count when items are loaded", async () => {
    vi.mocked(api.shop.list).mockResolvedValue([SHOP_ITEM]);
    render(<ShopView />);
    await waitFor(() => {
      expect(screen.getByText(/1 item/i)).toBeInTheDocument();
    });
  });
});
