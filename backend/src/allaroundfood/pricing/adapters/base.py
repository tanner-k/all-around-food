"""Retailer adapter protocol and shared PriceQuote model."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict


class PriceQuote(BaseModel):
    """A single product price quote from a retailer.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    retailer: str
    store_location_id: str
    retailer_sku: str
    canonical_product_id_hint: str | None  # None until matching runs
    title: str
    brand: str | None
    size_raw: str | None
    price_cents: int  # Current price the customer pays (sale price if on promo).
    was_on_promo: bool
    promo_price_cents: int | None  # Equals price_cents when was_on_promo=True; None otherwise.
    url: str | None
    raw: dict[str, Any]


@runtime_checkable
class RetailerAdapter(Protocol):
    """Protocol that all retailer adapters must satisfy."""

    async def get_access_token(self) -> str:
        """Return a valid bearer token, fetching or refreshing as needed."""
        ...

    async def find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int = 10,
    ) -> list[Any]:
        """Return StoreLocation objects near the given ZIP code."""
        ...

    async def search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search for products matching term at the given store location."""
        ...
