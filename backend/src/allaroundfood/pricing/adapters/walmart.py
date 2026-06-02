"""Walmart storefront adapter (unofficial — reverse-engineered JSON endpoint).

.. warning::
    This adapter is **unofficial** and personal-use only.  It is gated by the
    ``DISABLE_UNOFFICIAL_INGESTION`` environment variable (default: enabled).
    See ADR 0003 for the personal-use posture and ToS acknowledgment.

Reverse-engineering notes
--------------------------
All notes below are based on traffic analysis with browser DevTools.
No live session has been captured yet — see TODO items.

**Store finder endpoint** (JSON-primary)::

    GET https://www.walmart.com/store/finder/view/ajax
    Query params: stype=geoCode, lat=<lat>, lon=<lon>, distance=<miles>
    OR:
    POST https://www.walmart.com/orchestra/home/graphql/GetStoreDetails
    Body: { "query": "...", "variables": { "zipCode": "<zip>", "distance": <miles> } }

    TODO(reverse-engineer): capture the actual request/response from a live session.
    The ``/orchestra/`` path uses a GraphQL-style envelope but may differ across
    Walmart app versions.  The placeholder schema below is based on observed
    patterns from public API docs and community reports.

Expected cookies for location context::

    locDataV3=<base64-encoded location blob>
    locGuestData=<guest-session cookie>
    assortmentStoreId=<numeric store ID>

    TODO(reverse-engineer): capture real cookie values to confirm fields.

**Product search endpoint** (JSON-primary)::

    GET https://www.walmart.com/search/api?query=<term>&stores=<store_id>&ps=<limit>
    OR (newer):
    POST https://www.walmart.com/orchestra/...
    Headers: { "wm_qos.correlation_id": "<uuid>", "wm_svc.name": "walmart-fusion" }

    TODO(reverse-engineer): confirm exact URL and required headers from live capture.

**Placeholder JSON shapes** (synthetic, well-formed based on observed community patterns)::

    Location response:
    {
      "payload": {
        "stores": [
          {
            "id": "2648",
            "displayName": "Walmart Supercenter",
            "address": {
              "address": "1234 W Bangerter Hwy",
              "city": "South Jordan",
              "state": "UT",
              "postalCode": "84095"
            },
            "geoPoint": { "latitude": 40.5561, "longitude": -111.9287 },
            "distance": 1.4,
            "services": ["PickupTodayCheckout", "DeliveryCheckout"]
          }
        ]
      }
    }

    Product response:
    {
      "query": "milk",
      "payload": {
        "numItems": 24,
        "items": [
          {
            "usItemId": "10452522",
            "name": "Great Value Whole Milk, Gallon",
            "brand": "Great Value",
            "salePrice": 3.98,
            "wasPrice": null,
            "priceInfo": { "currentPrice": { "price": 3.98 }, "wasPrice": null },
            "imageInfo": { "thumbnailUrl": "https://i5.walmartimages.com/..." },
            "variantCriteria": [],
            "weightIncrement": 1,
            "weightUnit": "GAL",
            "shortDescription": "Vitamin D whole milk",
            "productUrl": "/ip/Great-Value-Whole-Milk-Gallon/10452522"
          }
        ]
      }
    }
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from allaroundfood.pricing.adapters._guard import unofficial_only
from allaroundfood.pricing.adapters._resilience import (
    record_fallback_attempt,
    record_fallback_result,
    record_json_failure,
    record_json_success,
    retry_json,
)
from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.models import StoreLocation

logger = logging.getLogger(__name__)

_WALMART_BASE = "https://www.walmart.com"
_STORE_FINDER_URL = f"{_WALMART_BASE}/store/finder/view/ajax"
_SEARCH_URL = f"{_WALMART_BASE}/search/api"

# Default headers that mimic a real browser session.
# TODO(reverse-engineer): update with headers observed from a live capture.
_DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "wm_svc.name": "walmart-fusion",
}


class WalmartAdapter:
    """Adapter for Walmart storefront product and location data.

    Unofficial — uses reverse-engineered JSON endpoints.  Kill-switch gated via
    ``DISABLE_UNOFFICIAL_INGESTION``.

    TODO items for live-capture follow-up:
    - Confirm exact ``/orchestra/...`` GraphQL endpoint URL and body shape.
    - Capture ``locDataV3``, ``locGuestData``, and ``assortmentStoreId`` cookie values.
    - Confirm ``wm_qos.correlation_id`` and ``wm_svc.name`` header requirements.
    - Validate product search pagination (``start`` + ``ps`` params vs cursor).
    - Confirm promo detection field name (``wasPrice`` vs ``strikePrice``).
    """

    @unofficial_only
    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        """Initialise the adapter.

        Args:
            http_client: Optional pre-configured httpx client (for tests).

        Raises:
            UnofficialIngestionDisabledError: If the kill-switch env var is set.
        """
        self._http_client = http_client

    async def _client(self) -> httpx.AsyncClient:
        if self._http_client is not None:
            return self._http_client
        return httpx.AsyncClient(headers=_DEFAULT_HEADERS)  # pragma: no cover

    async def get_access_token(self) -> str:
        """Walmart uses cookies/session rather than OAuth tokens.

        Returns:
            Empty string — no bearer token is needed for Walmart's JSON endpoints.
        """
        return ""

    async def find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int = 10,
    ) -> list[StoreLocation]:
        """Find Walmart stores near a ZIP code using the store-finder JSON endpoint.

        JSON-primary path: calls ``/store/finder/view/ajax``.
        Falls through to Playwright on any HTTP failure.

        Args:
            zip_code: US ZIP code to search around.
            radius_miles: Search radius in miles (default 10).

        Returns:
            List of StoreLocation objects.

        Raises:
            httpx.HTTPStatusError: On non-retryable HTTP errors (JSON path).
        """
        try:
            locations = await self._json_find_locations_by_zip(zip_code, radius_miles)
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            record_json_failure(logger, "walmart", "find_locations_by_zip", exc)
            record_fallback_attempt(logger, "walmart", "find_locations_by_zip", exc)
            try:
                locations = await self._locations_via_playwright(zip_code, radius_miles)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "walmart",
                    "find_locations_by_zip",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "walmart",
                "find_locations_by_zip",
                "fallback_success",
                result_count=len(locations),
            )
            return locations
        record_json_success(
            logger,
            "walmart",
            "find_locations_by_zip",
            result_count=len(locations),
        )
        return locations

    @retry_json("walmart", "find_locations_by_zip", logger)
    async def _json_find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        client = await self._client()
        response = await client.get(
            _STORE_FINDER_URL,
            params={
                "stype": "geoCode",
                "distance": str(radius_miles),
                "zipCode": zip_code,
            },
            headers=_DEFAULT_HEADERS,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        stores: list[dict[str, Any]] = payload.get("payload", {}).get("stores", [])
        return [self._parse_location(s) for s in stores]

    async def _locations_via_playwright(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        """Playwright fallback for store-finder when JSON endpoint fails.

        TODO(reverse-engineer): implement once cookies are captured.
        Required: ``locDataV3``, ``locGuestData`` cookies.
        The store-finder page at https://www.walmart.com/store/finder renders
        store cards in a JSON blob embedded in a ``<script id="__NEXT_DATA__">``
        tag — parse that after page load.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Walmart locations) — see reverse-engineering notes. "
            "Requires captured locDataV3 and locGuestData cookies."
        )

    @staticmethod
    def _parse_location(data: dict[str, Any]) -> StoreLocation:
        addr = data.get("address", {})
        geo = data.get("geoPoint", {})
        return StoreLocation(
            id=f"walmart-{data['id']}",
            retailer="walmart",
            store_id=str(data["id"]),
            name=data.get("displayName", ""),
            address=", ".join(
                part
                for part in [
                    addr.get("address"),
                    addr.get("city"),
                    addr.get("state"),
                ]
                if part
            ),
            zip=addr.get("postalCode", ""),
            lat=float(geo.get("latitude", 0.0)),
            lon=float(geo.get("longitude", 0.0)),
            fulfillment_zone=",".join(data.get("services", [])) or None,
            metadata={},
        )

    async def search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search for products at a Walmart store.

        JSON-primary path: calls ``/search/api``.
        Falls through to Playwright on failure.

        Args:
            store_location_id: Walmart store ID (numeric string, e.g. ``"2648"``).
            term: Search query string.
            limit: Maximum results to return (default 20).

        Returns:
            List of PriceQuote objects.
        """
        try:
            quotes = await self._json_search_products(store_location_id, term, limit)
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            record_json_failure(logger, "walmart", "search_products", exc)
            record_fallback_attempt(logger, "walmart", "search_products", exc)
            try:
                quotes = await self._search_via_playwright(store_location_id, term, limit)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "walmart",
                    "search_products",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "walmart",
                "search_products",
                "fallback_success",
                result_count=len(quotes),
            )
            return quotes
        record_json_success(
            logger,
            "walmart",
            "search_products",
            result_count=len(quotes),
        )
        return quotes

    @retry_json("walmart", "search_products", logger)
    async def _json_search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        # Strip the "walmart-" prefix if present (internal IDs include it)
        raw_id = store_location_id.removeprefix("walmart-")
        client = await self._client()
        response = await client.get(
            _SEARCH_URL,
            params={"query": term, "stores": raw_id, "ps": str(limit)},
            headers=_DEFAULT_HEADERS,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        items: list[dict[str, Any]] = payload.get("payload", {}).get("items", [])
        return [self._parse_product(store_location_id, item) for item in items]

    async def _search_via_playwright(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        """Playwright fallback for product search when JSON endpoint fails.

        TODO(reverse-engineer): implement once cookies and session tokens are captured.
        The ``/search`` page embeds results in ``__NEXT_DATA__`` — parse after load.
        Required cookies: ``assortmentStoreId=<store_id>``.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Walmart search) — see reverse-engineering notes. "
            "Requires assortmentStoreId cookie and confirmed search URL."
        )

    @staticmethod
    def _parse_product(store_location_id: str, data: dict[str, Any]) -> PriceQuote:
        price_info = data.get("priceInfo", {})
        current = price_info.get("currentPrice", {})
        was = price_info.get("wasPrice")

        current_price = float(current.get("price") or data.get("salePrice") or 0.0)
        was_price = float(was.get("price", 0.0)) if was else None

        was_on_promo = was_price is not None and was_price > current_price
        price_cents = round(current_price * 100)
        promo_price_cents = round(current_price * 100) if was_on_promo else None

        return PriceQuote(
            retailer="walmart",
            store_location_id=store_location_id,
            retailer_sku=str(data.get("usItemId", "")),
            canonical_product_id_hint=None,
            title=data.get("name", ""),
            brand=data.get("brand") or None,
            size_raw=data.get("weightUnit") or None,
            price_cents=price_cents,
            was_on_promo=was_on_promo,
            promo_price_cents=promo_price_cents,
            url=(
                f"https://www.walmart.com{data['productUrl']}" if data.get("productUrl") else None
            ),
            raw=data,
            source_tier="json",
        )
