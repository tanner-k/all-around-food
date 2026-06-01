/**
 * @vitest-environment jsdom
 *
 * Light render tests for ImportView — api client is mocked; no network/db.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks — must come before component imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      recipes: {
        import: vi.fn(),
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/import",
  useSearchParams: () => new URLSearchParams(),
}));

import React from "react";
import { ImportView } from "./ImportView";

describe("ImportView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the idle state with the import form", () => {
    render(<ImportView />);
    // Section header scene label
    expect(screen.getByText(/new recipe/i)).toBeInTheDocument();
    // URL input should be present
    expect(screen.getByPlaceholderText(/https:\/\/www\.seriouseats/i)).toBeInTheDocument();
    // Submit button
    expect(screen.getByRole("button", { name: /import recipe/i })).toBeInTheDocument();
  });

  it("submit button is disabled when no input is provided", () => {
    render(<ImportView />);
    const submitBtn = screen.getByRole("button", { name: /import recipe/i });
    expect(submitBtn).toBeDisabled();
  });

  it("renders the URL field and paste-text textarea", () => {
    render(<ImportView />);
    expect(screen.getByPlaceholderText(/paste the ingredients/i)).toBeInTheDocument();
  });

  it("renders source type pill labels", () => {
    render(<ImportView />);
    // Screenshot appears in the drop-zone prose and as a button label — use getAllByText
    expect(screen.getAllByText(/screenshot/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/paste text/i)).toBeInTheDocument();
  });
});
