import type { RetailerRanking } from "@/lib/pricing-schema";

interface PriceCompareTableProps {
  rankings: RetailerRanking[];
  selectedId: string | null;
  onSelect: (canonicalId: string) => void;
}

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatObservedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function PriceCompareTable({ rankings }: PriceCompareTableProps) {
  if (rankings.length === 0) {
    return (
      <p className="text-sm text-ink-mute italic">
        No price data found for this product.
      </p>
    );
  }

  const minPrice = Math.min(...rankings.map((r) => r.price_cents));

  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-paper/80">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Retailer
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Store ID
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Observed
            </th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row) => {
            const isCheapest = row.price_cents === minPrice;
            return (
              <tr
                key={`${row.retailer}-${row.store_location_id}`}
                className="border-b border-line last:border-b-0 hover:bg-terra/5 transition-colors"
              >
                <td className="px-4 py-3 text-ink-mute">{row.rank}</td>
                <td className="px-4 py-3 font-medium text-ink capitalize">
                  {row.retailer}
                </td>
                <td className="px-4 py-3 text-ink-mute font-mono text-xs">
                  {row.store_location_id}
                </td>
                <td
                  className={[
                    "px-4 py-3 text-right font-semibold tabular-nums",
                    isCheapest ? "text-forest" : "text-ink",
                  ].join(" ")}
                >
                  {isCheapest && (
                    <span className="mr-1 text-xs font-normal text-forest">
                      ★
                    </span>
                  )}
                  {centsToDisplay(row.price_cents)}
                </td>
                <td className="px-4 py-3 text-right text-ink-mute">
                  {formatObservedAt(row.observed_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
