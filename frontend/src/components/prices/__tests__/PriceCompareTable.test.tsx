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
    // Both table cells and cards render in JSDOM (CSS breakpoints are not enforced),
    // so each retailer name appears at least once.
    expect(screen.getAllByText("kroger").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("walmart").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("costco").length).toBeGreaterThanOrEqual(1);
  });

  it("displays formatted prices", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    expect(screen.getAllByText("$2.99").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$3.49").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$3.99").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights cheapest cell with star indicator", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    // Cheapest table row still contains the star symbol in a <td>
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
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
  });

  it("renders table headers", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    // Both trees render in JSDOM — use getAllByText since labels appear multiple times.
    expect(screen.getAllByText(/rank/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/retailer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/price/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/observed/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders both table cells and mobile cards for the same row data", () => {
    render(
      <PriceCompareTable rankings={RANKINGS} selectedId={null} onSelect={vi.fn()} />
    );
    // JSDOM renders both trees simultaneously — each retailer appears twice
    // (once in the desktop table <td>, once in the mobile card <div>).
    expect(screen.getAllByText("kroger")).toHaveLength(2);
    expect(screen.getAllByText("walmart")).toHaveLength(2);
    expect(screen.getAllByText("costco")).toHaveLength(2);

    // The cheapest price also appears in both trees.
    expect(screen.getAllByText("$2.99")).toHaveLength(2);

    // "Best price" badge only appears on the cheapest card.
    expect(screen.getByText(/best price/i)).toBeInTheDocument();
  });
});
