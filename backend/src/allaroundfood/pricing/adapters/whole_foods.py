"""Whole Foods (Amazon) storefront adapter (unofficial — reverse-engineered JSON).

.. warning::
    This adapter is **unofficial** and personal-use only.  It is gated by the
    ``DISABLE_UNOFFICIAL_INGESTION`` environment variable (default: enabled).
    See ADR 0003 for the personal-use posture and ToS acknowledgment.

Reverse-engineering notes
--------------------------
All notes below are based on traffic analysis with browser DevTools.
No live session has been captured yet — see TODO items.

**Store locator endpoint** (JSON-primary)::

    GET https://www.wholefoodsmarket.com/api/graphql
    Body (GraphQL):
    {
      "query": "query StoreSearch($zip: String!, $radius: Int!) { ... }",
      "variables": { "zip": "<zip>", "radius": <miles> }
    }

    TODO(reverse-engineer): confirm exact query name and response shape.
    Whole Foods uses the Amazon GraphQL infrastructure — auth tokens required.

**Amazon Fresh / Whole Foods product search** (JSON-primary)::

    GET https://www.amazon.com/s
    Query params:
        k=<term>
        i=wholefoods          # Whole Foods filter
        n=16310101            # Grocery & Gourmet Food node
        rh=n:16310101         # refinement handler

    OR (preferred — parsed from XHR traffic)::

    POST https://www.amazon.com/s/query
    Headers required:
        lc-main: <locale-context — base64 encoded location>
        session-token: <Amazon session token from cookies>
        ubid-main: <Amazon ubid cookie value>
        x-amzn-RequestId: <uuid>

    TODO(reverse-engineer): capture the actual XHR request headers and body
    from a logged-in Amazon session browsing Whole Foods products.

Expected cookies / headers (Amazon delivery routing)::

    lc-main=<base64 location context>   # delivery address encoded
    session-token=<session token>        # Amazon session
    ubid-main=<user browser ID>          # Amazon device fingerprint
    x-amz-amabot-click-source: ...       # anti-bot signal

    TODO(reverse-engineer): capture live cookie values from an Amazon session.
    These rotate; do not hardcode.

**Placeholder JSON shapes** (synthetic, well-formed based on observed patterns)::

    Store locator response:
    {
      "data": {
        "storeSearch": {
          "stores": [
            {
              "id": "wfm-south-jordan-ut",
              "name": "Whole Foods Market",
              "address": {
                "street": "10885 S River Front Pkwy",
                "city": "South Jordan",
                "state": "UT",
                "postalCode": "84095"
              },
              "coordinates": { "lat": 40.5579, "lng": -111.9315 },
              "phone": "801-302-0070",
              "hours": { "mon": "7:00 AM - 10:00 PM" }
            }
          ]
        }
      }
    }

    Product search response (Amazon s/query JSON-in-HTML or XHR payload)::

    {
      "searchResult": {
        "totalResultCount": 48,
        "asin": "B07XJY9BBJ",
        "items": [
          {
            "asin": "B07XJY9BBJ",
            "title": "365 by Whole Foods Market, Organic Whole Milk, Half Gallon",
            "brand": "365 by Whole Foods Market",
            "price": {
              "amount": 4.99,
              "currency": "USD",
              "displayAmount": "$4.99"
            },
            "salePrice": null,
            "imageUrl": "https://m.media-amazon.com/images/...",
            "detailPageUrl": "/dp/B07XJY9BBJ",
            "availability": "IN_STOCK",
            "size": "64 Fl Oz"
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

_WFM_BASE = "https://www.wholefoodsmarket.com"
_AMAZON_BASE = "https://www.amazon.com"
_STORE_GRAPHQL_URL = f"{_WFM_BASE}/api/graphql"
_PRODUCT_SEARCH_URL = f"{_AMAZON_BASE}/s/query"

# Default headers mimicking an Amazon browser session.
# TODO(reverse-engineer): update lc-main, session-token, ubid-main from a live capture.
_DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "text/html,application/xhtml+xml,application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    # Amazon delivery-routing headers — populated from live session:
    # "lc-main": "<base64-encoded location context>",
    # "session-token": "<session token>",
    # "ubid-main": "<ubid value>",
}


class WholeFoodsAdapter:
    """Adapter for Whole Foods Market (Amazon) product and location data.

    Unofficial — uses reverse-engineered JSON endpoints.  Kill-switch gated via
    ``DISABLE_UNOFFICIAL_INGESTION``.

    Uses the ``i=wholefoods`` Amazon search filter to scope results to
    Whole Foods inventory.  Delivery routing relies on Amazon session headers
    (``lc-main``, ``session-token``, ``ubid-main``).

    PriceQuote.retailer is set to ``"wholefoods"``.

    TODO items for live-capture follow-up:
    - Capture ``lc-main``, ``session-token``, ``ubid-main`` from a live Amazon session.
    - Confirm Whole Foods GraphQL query structure (schema may be behind auth).
    - Validate product search JSON shape — may be embedded in HTML page, not bare JSON.
    - Confirm Amazon node ID for Whole Foods grocery category (``n=16310101`` placeholder).
    - Determine if ``/s/query`` or ``/s`` returns parseable JSON without full JS execution.
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
        """Whole Foods / Amazon uses session cookies rather than OAuth tokens.

        Returns:
            Empty string — no bearer token; session headers are used instead.
        """
        return ""

    async def find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int = 10,
    ) -> list[StoreLocation]:
        """Find Whole Foods stores near a ZIP code.

        JSON-primary path: calls the Whole Foods GraphQL API.
        Falls through to Playwright on failure.

        Args:
            zip_code: US ZIP code to search around.
            radius_miles: Search radius in miles (default 10).

        Returns:
            List of StoreLocation objects.
        """
        try:
            locations = await self._json_find_locations_by_zip(zip_code, radius_miles)
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            record_json_failure(logger, "wholefoods", "find_locations_by_zip", exc)
            record_fallback_attempt(logger, "wholefoods", "find_locations_by_zip", exc)
            try:
                locations = await self._locations_via_playwright(zip_code, radius_miles)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "wholefoods",
                    "find_locations_by_zip",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "wholefoods",
                "find_locations_by_zip",
                "fallback_success",
                result_count=len(locations),
            )
            return locations
        record_json_success(
            logger,
            "wholefoods",
            "find_locations_by_zip",
            result_count=len(locations),
        )
        return locations

    @retry_json("wholefoods", "find_locations_by_zip", logger)
    async def _json_find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        client = await self._client()
        # TODO(reverse-engineer): replace with actual GraphQL query string.
        _gql = (
            "query StoreSearch($zip: String!, $radius: Int!) {"
            " storeSearch(zip: $zip, radius: $radius) {"
            " stores { id name address { street city state postalCode }"
            " coordinates { lat lng } phone } } }"
        )
        graphql_body: dict[str, Any] = {
            "query": _gql,
            "variables": {"zip": zip_code, "radius": radius_miles},
        }
        response = await client.post(
            _STORE_GRAPHQL_URL,
            json=graphql_body,
            headers={**_DEFAULT_HEADERS, "Content-Type": "application/json"},
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        stores: list[dict[str, Any]] = (
            payload.get("data", {}).get("storeSearch", {}).get("stores", [])
        )
        return [self._parse_location(s) for s in stores]

    async def _locations_via_playwright(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        """Playwright fallback for store locator.

        TODO(reverse-engineer): implement once Amazon session headers are captured.
        The store-finder at https://www.wholefoodsmarket.com/stores renders
        location cards via React — inspect network XHR for the JSON payload.
        Required: Amazon session cookies (``session-token``, ``ubid-main``).
        """
        raise NotImplementedError(
            "Playwright fallback pending (Whole Foods locations) — see reverse-engineering notes. "
            "Requires Amazon session-token and ubid-main cookies."
        )

    @staticmethod
    def _parse_location(data: dict[str, Any]) -> StoreLocation:
        addr = data.get("address", {})
        coords = data.get("coordinates", {})
        return StoreLocation(
            id=f"wholefoods-{data['id']}",
            retailer="wholefoods",
            store_id=str(data["id"]),
            name=data.get("name", "Whole Foods Market"),
            address=", ".join(
                part
                for part in [
                    addr.get("street"),
                    addr.get("city"),
                    addr.get("state"),
                ]
                if part
            ),
            zip=addr.get("postalCode", ""),
            lat=float(coords.get("lat", 0.0)),
            lon=float(coords.get("lng", 0.0)),
            fulfillment_zone=None,
            metadata={"phone": data.get("phone", "")},
        )

    async def search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search Whole Foods products via Amazon search.

        JSON-primary path: uses ``i=wholefoods`` Amazon search filter.
        Falls through to Playwright on failure.

        Args:
            store_location_id: Whole Foods store ID (e.g. ``"wholefoods-wfm-south-jordan-ut"``).
            term: Search query string.
            limit: Maximum results to return (default 20).

        Returns:
            List of PriceQuote objects.
        """
        try:
            quotes = await self._json_search_products(store_location_id, term, limit)
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            record_json_failure(logger, "wholefoods", "search_products", exc)
            record_fallback_attempt(logger, "wholefoods", "search_products", exc)
            try:
                quotes = await self._search_via_playwright(store_location_id, term, limit)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "wholefoods",
                    "search_products",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "wholefoods",
                "search_products",
                "fallback_success",
                result_count=len(quotes),
            )
            return quotes
        record_json_success(
            logger,
            "wholefoods",
            "search_products",
            result_count=len(quotes),
        )
        return quotes

    @retry_json("wholefoods", "search_products", logger)
    async def _json_search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        client = await self._client()
        response = await client.get(
            f"{_AMAZON_BASE}/s",
            params={
                "k": term,
                "i": "wholefoods",
                # TODO(reverse-engineer): confirm correct grocery node ID
                "n": "16310101",
                "ps": str(limit),
            },
            headers=_DEFAULT_HEADERS,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        items: list[dict[str, Any]] = payload.get("searchResult", {}).get("items", [])
        return [self._parse_product(store_location_id, item) for item in items]

    async def _search_via_playwright(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        """Playwright fallback for product search.

        TODO(reverse-engineer): implement once Amazon session details are captured.
        Navigate to https://www.amazon.com/s?k=<term>&i=wholefoods with
        delivery address set.  Results are rendered client-side; intercept the
        XHR to ``/s/query`` for the JSON payload.
        Required: ``lc-main`` (location context), ``session-token``, ``ubid-main``.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Whole Foods search) — see reverse-engineering notes. "
            "Requires lc-main, session-token, and ubid-main Amazon headers."
        )

    @staticmethod
    def _parse_product(store_location_id: str, data: dict[str, Any]) -> PriceQuote:
        price_info = data.get("price", {})
        sale_price = data.get("salePrice")

        regular_price = float(price_info.get("amount") or 0.0)
        sale = float(sale_price.get("amount", 0.0)) if sale_price else None

        was_on_promo = sale is not None and sale < regular_price
        price_cents = round(regular_price * 100)
        promo_price_cents = round(sale * 100) if was_on_promo and sale is not None else None

        detail_url = data.get("detailPageUrl")
        url = f"https://www.amazon.com{detail_url}" if detail_url else None

        return PriceQuote(
            retailer="wholefoods",
            store_location_id=store_location_id,
            retailer_sku=str(data.get("asin", "")),
            canonical_product_id_hint=None,
            title=data.get("title", ""),
            brand=data.get("brand") or None,
            size_raw=data.get("size") or None,
            price_cents=price_cents,
            was_on_promo=was_on_promo,
            promo_price_cents=promo_price_cents,
            url=url,
            raw=data,
            source_tier="json",
        )
