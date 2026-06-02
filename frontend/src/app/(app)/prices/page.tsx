import { Suspense } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { PriceCompareTable } from "@/components/prices/PriceCompareTable";
import { PriceHistoryChart } from "@/components/prices/PriceHistoryChart";
import { ZipSelector } from "@/components/prices/ZipSelector";
import { BACKEND_URL } from "@/lib/backend-url";
import type {
  CanonicalProductSummary,
  PricePoint,
  RetailerRanking,
} from "@/lib/pricing-schema";

// ---------------------------------------------------------------------------
// Server-side fetch helpers (direct to backend, no proxy needed for SSR)
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  success: boolean;
  data?: T | null;
  error?: string | null;
}

async function fetchSearchResults(
  q: string,
  zip: string
): Promise<CanonicalProductSummary[]> {
  try {
    const params = new URLSearchParams({ q });
    if (zip) params.set("zip", zip);
    const res = await fetch(
      `${BACKEND_URL}/pricing/search?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json: ApiEnvelope<CanonicalProductSummary[]> = await res.json();
    return json.success && json.data ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchCompare(
  canonicalId: string,
  zip: string
): Promise<RetailerRanking[]> {
  try {
    const params = new URLSearchParams({ canonical_id: canonicalId });
    if (zip) params.set("zip", zip);
    const res = await fetch(
      `${BACKEND_URL}/pricing/compare?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json: ApiEnvelope<RetailerRanking[]> = await res.json();
    return json.success && json.data ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchHistory(
  canonicalId: string,
  zip: string
): Promise<PricePoint[]> {
  try {
    const params = new URLSearchParams({ canonical_id: canonicalId });
    if (zip) params.set("zip", zip);
    const res = await fetch(
      `${BACKEND_URL}/pricing/history?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json: ApiEnvelope<PricePoint[]> = await res.json();
    return json.success && json.data ? json.data : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ zip?: string; q?: string; id?: string }>;
}

export default async function PricesPage({ searchParams }: PageProps) {
  const { zip = "", q = "", id = "" } = await searchParams;

  const hasZip = /^\d{5}$/.test(zip);

  // Parallel fetches — only run when we have enough params
  const [searchResults, rankings, history] = await Promise.all([
    q && hasZip ? fetchSearchResults(q, zip) : Promise.resolve<CanonicalProductSummary[]>([]),
    id && hasZip ? fetchCompare(id, zip) : Promise.resolve<RetailerRanking[]>([]),
    id && hasZip ? fetchHistory(id, zip) : Promise.resolve<PricePoint[]>([]),
  ]);

  const selectedProduct = id
    ? searchResults.find((p) => p.canonical_product_id === id) ?? null
    : null;

  return (
    <>
      <SectionHeader
        number="06"
        scene="PRICING"
        title={
          <>
            Grocery{" "}
            <em className="italic text-terra">price comparison</em>.
          </>
        }
        description="Search for a product, set your ZIP, and see who's cheapest near you."
      />

      <div className="mt-12 space-y-8">
        {/* Controls row */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 sm:gap-4">
          <Suspense>
            <ZipSelector currentZip={zip} />
          </Suspense>
          <Suspense>
            <ProductSearch currentQ={q} currentZip={zip} />
          </Suspense>
        </div>

        {/* Empty state when no ZIP */}
        {!hasZip && (
          <div className="rounded-xl border border-line bg-paper px-6 py-10 text-center">
            <p className="text-ink-mute">
              Enter a 5-digit ZIP code above to see prices near you.
            </p>
          </div>
        )}

        {/* Search results list */}
        {hasZip && q && searchResults.length > 0 && (
          <section>
            <h2 className="mb-3 font-serif text-lg italic text-ink">
              Results for{" "}
              <span className="text-terra">&ldquo;{q}&rdquo;</span>
            </h2>
            <div className="rounded-xl border border-line bg-paper divide-y divide-line">
              {searchResults.map((product) => (
                <ProductRow
                  key={product.canonical_product_id}
                  product={product}
                  isSelected={product.canonical_product_id === id}
                  zip={zip}
                  q={q}
                />
              ))}
            </div>
          </section>
        )}

        {/* No results */}
        {hasZip && q && searchResults.length === 0 && (
          <p className="text-sm italic text-ink-mute">
            No products found for &ldquo;{q}&rdquo; in ZIP {zip}.
          </p>
        )}

        {/* Compare table */}
        {id && (
          <section>
            <h2 className="mb-3 font-serif text-lg italic text-ink">
              {selectedProduct
                ? `${selectedProduct.name} — price comparison`
                : "Price comparison"}
            </h2>
            <PriceCompareTable
              rankings={rankings}
              selectedId={id}
              onSelect={() => {}}
            />
          </section>
        )}

        {/* History chart */}
        {id && (
          <section>
            <h2 className="mb-3 font-serif text-lg italic text-ink">
              Price history{selectedProduct ? ` — ${selectedProduct.name}` : ""}
            </h2>
            <PriceHistoryChart points={history} />
          </section>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (server)
// ---------------------------------------------------------------------------

function ProductSearch({
  currentQ,
  currentZip,
}: {
  currentQ: string;
  currentZip: string;
}) {
  // Client interactivity is handled via URL params; the search form submits
  // as a plain HTML form (GET) so it works without JS as well.
  return (
    <form method="GET" className="flex gap-2 w-full sm:w-auto">
      {currentZip && (
        <input type="hidden" name="zip" value={currentZip} />
      )}
      <input
        type="text"
        name="q"
        defaultValue={currentQ}
        placeholder="Search products…"
        className="w-full sm:w-56 rounded-xl border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-terra focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-xl bg-terra px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] min-h-11 whitespace-nowrap"
      >
        Search
      </button>
    </form>
  );
}

function ProductRow({
  product,
  isSelected,
  zip,
  q,
}: {
  product: CanonicalProductSummary;
  isSelected: boolean;
  zip: string;
  q: string;
}) {
  const href = `?zip=${zip}&q=${encodeURIComponent(q)}&id=${product.canonical_product_id}`;
  return (
    <a
      href={href}
      className={[
        "flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-terra/5",
        isSelected ? "bg-terra/10" : "",
      ].join(" ")}
    >
      <span className="font-medium text-ink">
        {product.brand ? `${product.brand} ` : ""}
        {product.name}
      </span>
      <span className="text-ink-mute text-xs">
        {product.size_value != null
          ? `${product.size_value}${product.size_unit ?? ""}`
          : ""}
        {product.category ? ` · ${product.category}` : ""}
      </span>
    </a>
  );
}
