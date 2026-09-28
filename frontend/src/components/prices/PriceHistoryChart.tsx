"use client";

import type { PricePoint } from "@/lib/pricing-schema";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PRICE_CHART_FALLBACK_COLOR,
  PRICE_CHART_GRID,
  PRICE_CHART_LABEL,
  PRICE_CHART_STORE_COLORS,
  PRICE_CHART_TICK,
  PRICE_CHART_TOOLTIP_BG,
  PRICE_CHART_TOOLTIP_BORDER,
} from "@/lib/theme";

interface PriceHistoryChartProps {
  points: PricePoint[];
}

function retailerColour(name: string, index: number): string {
  return (
    PRICE_CHART_STORE_COLORS[name.toLowerCase()] ??
    PRICE_CHART_STORE_COLORS[`default${index % 2}`] ??
    PRICE_CHART_FALLBACK_COLOR
  );
}

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

interface ChartRow {
  date: string;
  [retailer: string]: string | number;
}

/** Pivot flat PricePoint array into per-date rows keyed by retailer. */
function pivotPoints(points: PricePoint[]): {
  rows: ChartRow[];
  retailers: string[];
} {
  const retailers = [...new Set(points.map((p) => p.retailer))].sort();
  const byDate = new Map<string, ChartRow>();

  for (const point of points) {
    const date = formatDateShort(point.observed_at);
    if (!byDate.has(date)) {
      byDate.set(date, { date });
    }
    const row = byDate.get(date)!;
    // Use cents as the numeric value; tooltip formats it.
    const existing = row[point.retailer];
    if (existing === undefined || point.price_cents < (existing as number)) {
      row[point.retailer] = point.price_cents;
    }
  }

  const rows = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);

  return { rows, retailers };
}

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-line bg-paper">
        <p className="text-sm italic text-ink-mute">
          No price history available.
        </p>
      </div>
    );
  }

  const { rows, retailers } = pivotPoints(points);

  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={PRICE_CHART_GRID} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: PRICE_CHART_TICK }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={centsToDisplay}
            tick={{ fontSize: 11, fill: PRICE_CHART_TICK }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value: number) => [centsToDisplay(value), ""]}
            labelStyle={{ color: PRICE_CHART_LABEL, fontWeight: 600 }}
            contentStyle={{
              border: `1px solid ${PRICE_CHART_TOOLTIP_BORDER}`,
              borderRadius: "12px",
              background: PRICE_CHART_TOOLTIP_BG,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value: string) =>
              value.charAt(0).toUpperCase() + value.slice(1)
            }
          />
          {retailers.map((retailer, idx) => (
            <Line
              key={retailer}
              type="monotone"
              dataKey={retailer}
              name={retailer}
              stroke={retailerColour(retailer, idx)}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
