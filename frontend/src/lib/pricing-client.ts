/**
 * Browser-side typed client for pricing endpoints.
 * Calls the Next.js /api/pricing/... proxy routes, which forward to FastAPI.
 * Each function unwraps the ApiResponse envelope and throws on failure.
 */

import { z } from "zod";
import {
  BasketRankingResponseSchema,
  CanonicalProductSummarySchema,
  PricePointSchema,
  PromoFlagResponseSchema,
  RetailerRankingResponseSchema,
  type BasketRanking,
  type CanonicalProductSummary,
  type PricePoint,
  type PromoFlag,
  type RetailerRanking,
} from "./pricing-schema";

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// Generic envelope validator — validates success/error/data shape then parses
// the data field with the provided schema.
function unwrap<T>(raw: unknown, dataSchema: z.ZodType<T>): T {
  const envelopeSchema = z.object({
    success: z.boolean(),
    data: z.unknown().optional().nullable(),
    error: z.string().nullable().optional(),
  });
  const envelope = envelopeSchema.parse(raw);
  if (!envelope.success || envelope.data === null || envelope.data === undefined) {
    throw new Error(envelope.error ?? "Backend returned success=false");
  }
  return dataSchema.parse(envelope.data);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchProducts(
  q: string,
  zip?: string
): Promise<CanonicalProductSummary[]> {
  const params = new URLSearchParams({ q });
  if (zip) params.set("zip", zip);
  const raw = await request(`/api/pricing/search?${params.toString()}`);
  return unwrap(raw, CanonicalProductSummarySchema.array());
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export async function compareForProduct(
  canonical_id: string,
  zip?: string
): Promise<RetailerRanking[]> {
  const params = new URLSearchParams({ canonical_id });
  if (zip) params.set("zip", zip);
  const raw = await request(`/api/pricing/compare?${params.toString()}`);
  return unwrap(raw, RetailerRankingResponseSchema.array());
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function historyForProduct(
  canonical_id: string,
  zip?: string,
  days?: number
): Promise<PricePoint[]> {
  const params = new URLSearchParams({ canonical_id });
  if (zip) params.set("zip", zip);
  if (days !== undefined) params.set("days", String(days));
  const raw = await request(`/api/pricing/history?${params.toString()}`);
  return unwrap(raw, PricePointSchema.array());
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export async function getPromotions(days?: number): Promise<PromoFlag[]> {
  const params = new URLSearchParams();
  if (days !== undefined) params.set("days", String(days));
  const url = params.size
    ? `/api/pricing/promotions?${params.toString()}`
    : "/api/pricing/promotions";
  const raw = await request(url);
  return unwrap(raw, PromoFlagResponseSchema.array());
}

// ---------------------------------------------------------------------------
// Basket
// ---------------------------------------------------------------------------

export async function basketTotals(
  canonical_product_ids: string[],
  zip?: string
): Promise<BasketRanking[]> {
  const raw = await request("/api/pricing/basket", {
    method: "POST",
    body: JSON.stringify({ canonical_product_ids, zip: zip ?? null }),
  });
  return unwrap(raw, BasketRankingResponseSchema.array());
}
