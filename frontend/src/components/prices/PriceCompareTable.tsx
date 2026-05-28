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

// ── Shared row data type ──────────────────────────────────────────────────────

interface RowData {
  row: RetailerRanking;
  isCheapest: boolean;
}

// ── Table-cell sub-component (md+) ───────────────────────────────────────────

function PriceCompareRow({ row, isCheapest }: RowData) {
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
          <span className="mr-1 text-xs font-normal text-forest">★</span>
        )}
        {centsToDisplay(row.price_cents)}
      </td>
      <td className="px-4 py-3 text-right text-ink-mute">
        {formatObservedAt(row.observed_at)}
      </td>
    </tr>
  );
}

// ── Card sub-component (<md) ──────────────────────────────────────────────────

function PriceCompareCard({ row, isCheapest }: RowData) {
  return (
    <div className="border border-line rounded-lg p-4 w-full flex flex-col gap-2">
      {/* Retailer name + cheapest badge */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink capitalize text-base">
          {row.retailer}
        </span>
        {isCheapest && (
          <span className="text-xs font-semibold text-forest bg-forest/10 px-2 py-0.5 rounded-full">
            ★ Best price
          </span>
        )}
      </div>

      {/* Price — prominent */}
      <p
        className={[
          "text-2xl font-semibold tabular-nums leading-none",
          isCheapest ? "text-forest" : "text-ink",
        ].join(" ")}
      >
        {centsToDisplay(row.price_cents)}
      </p>

      {/* Secondary fields */}
      <div className="flex flex-col gap-1 mt-1">
        <div className="flex justify-between text-sm">
          <span className="text-ink-mute">Rank</span>
          <span className="text-ink font-medium">#{row.rank}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-mute">Store ID</span>
          <span className="text-ink font-mono text-xs">{row.store_location_id}</span>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-soft mt-1">
        Updated {formatObservedAt(row.observed_at)}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
    <>
      {/* Desktop table — hidden below md */}
      <div className="hidden md:block rounded-xl border border-line bg-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper/80">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                Rank
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                Retailer
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                Store ID
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                Price
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                Observed
              </th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((row) => (
              <PriceCompareRow
                key={`${row.retailer}-${row.store_location_id}`}
                row={row}
                isCheapest={row.price_cents === minPrice}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — hidden at md+ */}
      <div className="flex flex-col gap-3 md:hidden">
        {rankings.map((row) => (
          <PriceCompareCard
            key={`${row.retailer}-${row.store_location_id}-card`}
            row={row}
            isCheapest={row.price_cents === minPrice}
          />
        ))}
      </div>
    </>
  );
}
