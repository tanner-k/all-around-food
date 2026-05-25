"""Request and response Pydantic models for pricing API endpoints."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Shared validators
# ---------------------------------------------------------------------------

_ZIP_RE = re.compile(r"^\d{5}$")


def _validate_zip(v: str | None) -> str | None:
    if v is None:
        return v
    if not _ZIP_RE.match(v):
        raise ValueError("zip must be a 5-digit US ZIP code (e.g. '90210')")
    return v


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class CanonicalProductSummary(BaseModel):
    """Lightweight canonical product representation for search results."""

    model_config = ConfigDict(frozen=True)

    canonical_product_id: str
    name: str
    brand: str | None
    size_value: float | None
    size_unit: str | None
    category: str | None


# ---------------------------------------------------------------------------
# Compare (retailer ranking)
# ---------------------------------------------------------------------------


class RetailerRankingResponse(BaseModel):
    """Single retailer price ranking for a canonical product."""

    model_config = ConfigDict(frozen=True)

    retailer: str
    store_location_id: str
    price_cents: int
    observed_at: datetime
    rank: int


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


class PricePoint(BaseModel):
    """A single historical price observation for a product."""

    model_config = ConfigDict(frozen=True)

    observed_at: datetime
    retailer: str
    store_location_id: str
    price_cents: int
    was_on_promo: bool


# ---------------------------------------------------------------------------
# Promotions
# ---------------------------------------------------------------------------


class PromoFlagResponse(BaseModel):
    """A detected promotional price drop."""

    model_config = ConfigDict(frozen=True)

    canonical_product_id: str
    retailer: str
    store_location_id: str
    baseline_price_cents: float
    drop_price_cents: float
    zscore: float
    observed_at: datetime
    was_marked_promo: bool


# ---------------------------------------------------------------------------
# Basket
# ---------------------------------------------------------------------------


class BasketRequest(BaseModel):
    """POST /pricing/basket request body."""

    model_config = ConfigDict(frozen=True)

    canonical_product_ids: list[str] = Field(..., min_length=1)
    zip: str | None = None

    @field_validator("zip")
    @classmethod
    def validate_zip(cls, v: str | None) -> str | None:
        """Validate ZIP is a 5-digit code."""
        return _validate_zip(v)


class BasketRankingResponse(BaseModel):
    """Per-retailer basket total response."""

    model_config = ConfigDict(frozen=True)

    retailer: str
    total_cents: int
    items_covered: int
    items_missing: int
