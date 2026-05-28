import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ApiResponseSchema,
  BasketRankingResponseSchema,
  CanonicalProductSummarySchema,
  PricePointSchema,
  PromoFlagResponseSchema,
  RetailerRankingResponseSchema,
} from "../pricing-schema";

// Helper: build an ApiResponse envelope around any schema
function makeEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return ApiResponseSchema(dataSchema);
}

// ---------------------------------------------------------------------------
// ApiResponse envelope
// ---------------------------------------------------------------------------

describe("ApiResponseSchema", () => {
  it("parses a successful envelope with data", () => {
    const schema = makeEnvelope(z.string());
    const result = schema.parse({ success: true, data: "hello" });
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello");
  });

  it("parses a failure envelope with error", () => {
    const schema = makeEnvelope(z.string());
    const result = schema.parse({ success: false, error: "oops" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("oops");
  });

  it("allows null data", () => {
    const schema = makeEnvelope(z.string());
    const result = schema.parse({ success: false, data: null });
    expect(result.data).toBeNull();
  });

  it("rejects missing success field", () => {
    const schema = makeEnvelope(z.string());
    expect(() => schema.parse({ data: "hi" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CanonicalProductSummarySchema
// ---------------------------------------------------------------------------

describe("CanonicalProductSummarySchema", () => {
  const valid = {
    canonical_product_id: "abc-123",
    name: "Whole Milk",
    brand: "Horizon",
    size_value: 64,
    size_unit: "fl oz",
    category: "Dairy",
  };

  it("parses a valid product summary", () => {
    const result = CanonicalProductSummarySchema.parse(valid);
    expect(result.canonical_product_id).toBe("abc-123");
    expect(result.brand).toBe("Horizon");
  });

  it("allows null nullable fields", () => {
    const result = CanonicalProductSummarySchema.parse({
      ...valid,
      brand: null,
      size_value: null,
      size_unit: null,
      category: null,
    });
    expect(result.brand).toBeNull();
  });

  it("rejects missing canonical_product_id", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { canonical_product_id: _omit, ...rest } = valid;
    expect(() => CanonicalProductSummarySchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RetailerRankingResponseSchema
// ---------------------------------------------------------------------------

describe("RetailerRankingResponseSchema", () => {
  const valid = {
    retailer: "kroger",
    store_location_id: "store-001",
    price_cents: 399,
    observed_at: "2025-05-01T12:00:00Z",
    rank: 1,
  };

  it("parses valid retailer ranking", () => {
    const result = RetailerRankingResponseSchema.parse(valid);
    expect(result.rank).toBe(1);
    expect(result.price_cents).toBe(399);
  });

  it("rejects non-integer price_cents", () => {
    expect(() =>
      RetailerRankingResponseSchema.parse({ ...valid, price_cents: "free" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PricePointSchema
// ---------------------------------------------------------------------------

describe("PricePointSchema", () => {
  const valid = {
    observed_at: "2025-04-15T09:00:00Z",
    retailer: "walmart",
    store_location_id: "wm-999",
    price_cents: 279,
    was_on_promo: false,
  };

  it("parses a valid price point", () => {
    const result = PricePointSchema.parse(valid);
    expect(result.was_on_promo).toBe(false);
  });

  it("accepts was_on_promo=true", () => {
    const result = PricePointSchema.parse({ ...valid, was_on_promo: true });
    expect(result.was_on_promo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PromoFlagResponseSchema
// ---------------------------------------------------------------------------

describe("PromoFlagResponseSchema", () => {
  const valid = {
    canonical_product_id: "prod-1",
    retailer: "costco",
    store_location_id: "cst-1",
    baseline_price_cents: 500,
    drop_price_cents: 350,
    zscore: -2.1,
    observed_at: "2025-05-10T00:00:00Z",
    was_marked_promo: true,
  };

  it("parses valid promo flag", () => {
    const result = PromoFlagResponseSchema.parse(valid);
    expect(result.zscore).toBe(-2.1);
  });
});

// ---------------------------------------------------------------------------
// BasketRankingResponseSchema
// ---------------------------------------------------------------------------

describe("BasketRankingResponseSchema", () => {
  const valid = {
    retailer: "kroger",
    total_cents: 1500,
    items_covered: 4,
    items_missing: 1,
  };

  it("parses a valid basket ranking", () => {
    const result = BasketRankingResponseSchema.parse(valid);
    expect(result.items_covered).toBe(4);
    expect(result.items_missing).toBe(1);
  });

  it("rejects missing retailer", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { retailer: _omit, ...rest } = valid;
    expect(() => BasketRankingResponseSchema.parse(rest)).toThrow();
  });
});
