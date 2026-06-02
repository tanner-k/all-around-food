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

interface PriceHistoryChartProps {
  points: PricePoint[];
}

// Stable colour palette for up to 8 retailers.
const RETAILER_COLOURS: Record<string, string> = {
  kroger: "#C25A30",
  walmart: "#0071CE",
  costco: "#E31837",
  wholefoods: "#00674B",
  instacart: "#43B02A",
  ubereats: "#06C167",
  default0: "#7C6AF5",
  default1: "#F5A623",
};

function retailerColour(name: string, index: number): string {
  return (
    RETAILER_COLOURS[name.toLowerCase()] ??
    RETAILER_COLOURS[`default${index % 2}`] ??
    "#888888"
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e1db" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9E8E82" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={centsToDisplay}
            tick={{ fontSize: 11, fill: "#9E8E82" }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value: number) => [centsToDisplay(value), ""]}
            labelStyle={{ color: "#3D2B1F", fontWeight: 600 }}
            contentStyle={{
              border: "1px solid #E5E1DB",
              borderRadius: "12px",
              background: "#FDFBF8",
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
