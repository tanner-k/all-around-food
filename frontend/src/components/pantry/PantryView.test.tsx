/**
 * @vitest-environment jsdom
 *
 * Light render tests for PantryView — api client is mocked; no network/db.
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
      pantry: {
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
  usePathname: () => "/pantry",
  useSearchParams: () => new URLSearchParams(),
}));

import React from "react";
import { PantryView } from "./PantryView";
import { api } from "@/lib/api";

const PANTRY_ITEM = {
  id: "pi-1",
  userId: "u-1",
  name: "flour",
  amount: 1,
  unit: "kg",
  updatedAt: new Date().toISOString(),
};

describe("PantryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    vi.mocked(api.pantry.list).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PantryView />);
    expect(screen.getByText(/your kitchen/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders pantry items after load", async () => {
    vi.mocked(api.pantry.list).mockResolvedValue([PANTRY_ITEM]);
    render(<PantryView />);
    await waitFor(() => {
      expect(screen.getByText("flour")).toBeInTheDocument();
    });
  });

  it("shows empty state when pantry is empty", async () => {
    vi.mocked(api.pantry.list).mockResolvedValue([]);
    render(<PantryView />);
    await waitFor(() => {
      expect(screen.getByText(/pantry is empty/i)).toBeInTheDocument();
    });
  });

  it("renders error message when api.pantry.list fails", async () => {
    vi.mocked(api.pantry.list).mockRejectedValue(new Error("network error"));
    render(<PantryView />);
    await waitFor(() => {
      expect(screen.getByText(/could not load pantry/i)).toBeInTheDocument();
    });
  });

  it("shows item count after items load", async () => {
    vi.mocked(api.pantry.list).mockResolvedValue([PANTRY_ITEM]);
    render(<PantryView />);
    await waitFor(() => {
      expect(screen.getByText(/1 item/i)).toBeInTheDocument();
    });
  });
});
