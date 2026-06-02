"""Pydantic v2 models for the pricing domain.

# forward-compat: user_id — all models are currently single-tenant.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class StoreLocation(BaseModel):
    """A physical (or virtual) store location for a retailer.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    id: str
    retailer: Literal["kroger", "walmart", "costco", "wholefoods", "instacart", "ubereats"]
    store_id: str
    name: str
    address: str
    zip: str
    lat: float
    lon: float
    fulfillment_zone: str | None
    metadata: dict[str, Any] = {}


class CanonicalProduct(BaseModel):
    """A de-duplicated, retailer-agnostic product identity.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    id: str
    gtin: str | None
    brand: str | None
    name: str
    size_value: float | None
    size_unit: str | None
    category: str | None
    attributes: dict[str, str] = {}
    embedding: list[float] | None  # 384-dimensional when set (bge-small-en-v1.5)
    created_at: datetime
    updated_at: datetime


class RetailerSKU(BaseModel):
    """A retailer-specific product listing linked to a CanonicalProduct.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    id: str
    canonical_product_id: str
    retailer: str
    retailer_sku: str
    url: str | None
    title_raw: str
    size_raw: str | None
    last_seen_at: datetime
    match_method: Literal["upc", "fuzzy", "embedding", "manual"]
    match_confidence: float
    retailer_meta: dict[str, Any] = {}


class PriceObservation(BaseModel):
    """A single price data point captured for a product at a store.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    id: str
    retailer: str
    store_location_id: str
    retailer_sku_id: str
    canonical_product_id: str
    price_cents: int
    unit_price_cents: int | None
    was_on_promo: bool = False
    promo_text: str | None = None
    promo_price_cents: int | None = None
    currency: str = "USD"
    observed_at: datetime
    source_tier: Literal["api", "json", "browser", "ocr", "manual"]
    raw_response_hash: str
