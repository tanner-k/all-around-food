import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceHistoryChart } from "../PriceHistoryChart";
import type { PricePoint } from "@/lib/pricing-schema";

// recharts uses ResizeObserver and SVG APIs not present in jsdom — stub them.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock recharts to avoid SVG rendering complexity in jsdom
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <div data-testid="responsive-container">{children}</div>,
    LineChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="line-chart">{children}</div>
    ),
    Line: ({ name }: { name: string }) => (
      <div data-testid={`line-${name}`} />
    ),
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const POINTS: PricePoint[] = [
  {
    observed_at: "2025-05-01T10:00:00Z",
    retailer: "kroger",
    store_location_id: "kro-001",
    price_cents: 299,
    was_on_promo: false,
  },
  {
    observed_at: "2025-05-08T10:00:00Z",
    retailer: "kroger",
    store_location_id: "kro-001",
    price_cents: 319,
    was_on_promo: false,
  },
  {
    observed_at: "2025-05-01T10:00:00Z",
    retailer: "walmart",
    store_location_id: "wm-002",
    price_cents: 279,
    was_on_promo: true,
  },
];

describe("PriceHistoryChart", () => {
  it("renders the chart container for non-empty points", () => {
    render(<PriceHistoryChart points={POINTS} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("renders a Line for each distinct retailer", () => {
    render(<PriceHistoryChart points={POINTS} />);
    expect(screen.getByTestId("line-kroger")).toBeInTheDocument();
    expect(screen.getByTestId("line-walmart")).toBeInTheDocument();
  });

  it("shows empty state message for empty points array", () => {
    render(<PriceHistoryChart points={[]} />);
    expect(
      screen.getByText(/no price history available/i)
    ).toBeInTheDocument();
  });

  it("does not render chart container for empty points", () => {
    render(<PriceHistoryChart points={[]} />);
    expect(
      screen.queryByTestId("responsive-container")
    ).not.toBeInTheDocument();
  });
});
