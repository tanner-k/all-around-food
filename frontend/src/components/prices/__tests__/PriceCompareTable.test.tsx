import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceCompareTable } from "../PriceCompareTable";
import type { RetailerRanking } from "@/lib/pricing-schema";

const RANKINGS: RetailerRanking[] = [
  {
    retailer: "kroger",
    store_location_id: "kro-001",
    price_cents: 299,
    observed_at: "2025-05-01T10:00:00Z",
    rank: 1,
  },
  {
    retailer: "walmart",
    store_location_id: "wm-002",
    price_cents: 349,
    observed_at: "2025-05-02T10:00:00Z",
    rank: 2,
  },
  {
    retailer: "costco",
    store_location_id: "cst-003",
    price_cents: 399,
    observed_at: "2025-05-03T10:00:00Z",
    rank: 3,
  },
];

describe("PriceCompareTable", () => {
  it("renders a row for each ranking", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("kroger")).toBeInTheDocument();
    expect(screen.getByText("walmart")).toBeInTheDocument();
    expect(screen.getByText("costco")).toBeInTheDocument();
  });

  it("displays formatted prices", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("$2.99")).toBeInTheDocument();
    expect(screen.getByText("$3.49")).toBeInTheDocument();
    expect(screen.getByText("$3.99")).toBeInTheDocument();
  });

  it("highlights cheapest cell with star indicator", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    // Cheapest row contains the star symbol
    const cells = screen.getAllByRole("cell");
    const priceCell = cells.find((cell) => cell.textContent?.includes("★"));
    expect(priceCell).toBeDefined();
    expect(priceCell?.textContent).toContain("$2.99");
  });

  it("shows empty state for empty rankings array", () => {
    render(
      <PriceCompareTable rankings={[]} selectedId={null} onSelect={vi.fn()} />
    );
    expect(
      screen.getByText(/no price data found/i)
    ).toBeInTheDocument();
  });

  it("renders rank numbers", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders table headers", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText(/rank/i)).toBeInTheDocument();
    expect(screen.getByText(/retailer/i)).toBeInTheDocument();
    expect(screen.getByText(/price/i)).toBeInTheDocument();
    expect(screen.getByText(/observed/i)).toBeInTheDocument();
  });
});
