import { z } from "zod";

// ---------------------------------------------------------------------------
// Generic ApiResponse envelope
// ---------------------------------------------------------------------------

export function ApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable().optional(),
    error: z.string().nullable().optional(),
  });
}

// ---------------------------------------------------------------------------
// Search — CanonicalProductSummary
// ---------------------------------------------------------------------------

export const CanonicalProductSummarySchema = z.object({
  canonical_product_id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  size_value: z.number().nullable(),
  size_unit: z.string().nullable(),
  category: z.string().nullable(),
});

export type CanonicalProductSummary = z.infer<typeof CanonicalProductSummarySchema>;

// ---------------------------------------------------------------------------
// Compare — RetailerRankingResponse
// ---------------------------------------------------------------------------

export const RetailerRankingResponseSchema = z.object({
  retailer: z.string(),
  store_location_id: z.string(),
  price_cents: z.number().int(),
  observed_at: z.string(),
  rank: z.number().int(),
});

export type RetailerRanking = z.infer<typeof RetailerRankingResponseSchema>;

// ---------------------------------------------------------------------------
// History — PricePoint
// ---------------------------------------------------------------------------

export const PricePointSchema = z.object({
  observed_at: z.string(),
  retailer: z.string(),
  store_location_id: z.string(),
  price_cents: z.number().int(),
  was_on_promo: z.boolean(),
});

export type PricePoint = z.infer<typeof PricePointSchema>;

// ---------------------------------------------------------------------------
// Promotions — PromoFlagResponse
// ---------------------------------------------------------------------------

export const PromoFlagResponseSchema = z.object({
  canonical_product_id: z.string(),
  retailer: z.string(),
  store_location_id: z.string(),
  baseline_price_cents: z.number(),
  drop_price_cents: z.number(),
  zscore: z.number(),
  observed_at: z.string(),
  was_marked_promo: z.boolean(),
});

export type PromoFlag = z.infer<typeof PromoFlagResponseSchema>;

// ---------------------------------------------------------------------------
// Basket — BasketRankingResponse
// ---------------------------------------------------------------------------

export const BasketRankingResponseSchema = z.object({
  retailer: z.string(),
  total_cents: z.number().int(),
  items_covered: z.number().int(),
  items_missing: z.number().int(),
});

export type BasketRanking = z.infer<typeof BasketRankingResponseSchema>;

// ---------------------------------------------------------------------------
// Receipts — ReceiptParseResponse (from POST /receipts/parse)
// ---------------------------------------------------------------------------

export const ReceiptParseResponseSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      quantity_text: z.string().nullable(),
    })
  ),
  store: z.string().nullable(),
  parse_confidence: z.number().min(0).max(1).nullable(),
});

export type ReceiptParseResponse = z.infer<typeof ReceiptParseResponseSchema>;
