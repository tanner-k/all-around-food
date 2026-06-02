"""Costco warehouse adapter (unofficial — reverse-engineered JSON endpoint).

.. warning::
    This adapter is **unofficial** and personal-use only.  It is gated by the
    ``DISABLE_UNOFFICIAL_INGESTION`` environment variable (default: enabled).
    See ADR 0003 for the personal-use posture and ToS acknowledgment.

Reverse-engineering notes
--------------------------
All notes below are based on traffic analysis with browser DevTools.
No live session has been captured yet — see TODO items.

**Warehouse lookup endpoint** (JSON-primary)::

    GET https://www.costco.com/AjaxWarehouseBrowseLookupView
    Query params:
        langId=-1
        storeId=10301
        numOfWarehouses=<count>
        latitude=<lat>    (derived from ZIP via geocoding)
        longitude=<lon>
        countryCode=US
        operation=nearbyWarehouses

    TODO(reverse-engineer): confirm endpoint URL from live capture.
    Some community reports suggest the path changed in 2024.

**Product search-as-you-type endpoint** (JSON-primary)::

    GET https://www.costco.com/AjaxCatalogSearchResultView
    Query params:
        langId=-1
        storeId=10301
        catalogId=10701
        keyword=<term>
        pageSize=<limit>
        whloc=<warehouse_id>
        userLocation=<zip>

    TODO(reverse-engineer): confirm full param list and JSON shape.
    The search endpoint may require ``whl`` (warehouse location) cookie.

Expected cookies::

    whloc=<warehouse_id>          # preferred warehouse
    userLocation=<zip_code>       # user's ZIP for relevance ranking

    TODO(reverse-engineer): capture live values and confirm cookie names.

**Placeholder JSON shapes** (synthetic, well-formed based on observed patterns)::

    Warehouse response:
    {
      "warehouseList": [
        {
          "warehouseId": "1234",
          "displayName": "Costco Wholesale",
          "addr1": "1818 W Pkwy Blvd",
          "city": "West Valley City",
          "state": "UT",
          "zipCode": "84119",
          "latitude": 40.6896,
          "longitude": -111.9389,
          "distance": 3.2,
          "phoneNumber": "801-975-9200"
        }
      ]
    }

    Product response:
    {
      "catalogEntryList": [
        {
          "catalogEntryIdentifier": {
            "externalIdentifier": {
              "partNumber": "789012"
            }
          },
          "description": [
            {
              "name": "Kirkland Signature Organic Whole Milk",
              "shortDescription": "3 x 64 fl oz",
              "longDescription": "USDA Organic"
            }
          ],
          "price": [
            {
              "contractPrice": "12.49",
              "unitPrice": "12.49"
            }
          ],
          "attributes": {
            "brand": "Kirkland Signature",
            "membershipRequired": "true",
            "isMemberOnly": "true"
          },
          "thumbnail": "https://mobilecontent.costco.com/..."
        }
      ]
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

_COSTCO_BASE = "https://www.costco.com"
_WAREHOUSE_URL = f"{_COSTCO_BASE}/AjaxWarehouseBrowseLookupView"
_SEARCH_URL = f"{_COSTCO_BASE}/AjaxCatalogSearchResultView"

# Default params shared across requests.
# TODO(reverse-engineer): confirm storeId and catalogId values.
_BASE_PARAMS: dict[str, str] = {
    "langId": "-1",
    "storeId": "10301",
    "catalogId": "10701",
}

_DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}


class CostcoAdapter:
    """Adapter for Costco warehouse product and location data.

    Unofficial — uses reverse-engineered JSON endpoints.  Kill-switch gated via
    ``DISABLE_UNOFFICIAL_INGESTION``.

    Membership-only SKUs are flagged in ``PriceQuote.raw["membership_required"]``.

    TODO items for live-capture follow-up:
    - Confirm warehouse lookup URL (path may have changed in 2024).
    - Capture ``whloc`` and ``userLocation`` cookie values from a live session.
    - Confirm product search params (``whloc`` vs ``whlocId`` query param naming).
    - Validate membership-only flag field name in JSON (``isMemberOnly`` vs ``memberOnly``).
    - Confirm ``catalogEntryList`` nesting depth in search response.
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
        """Costco uses session cookies rather than OAuth tokens.

        Returns:
            Empty string — no bearer token is needed.
        """
        return ""

    async def find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int = 10,
    ) -> list[StoreLocation]:
        """Find Costco warehouses near a ZIP code.

        JSON-primary path: calls ``AjaxWarehouseBrowseLookupView``.
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
            record_json_failure(logger, "costco", "find_locations_by_zip", exc)
            record_fallback_attempt(logger, "costco", "find_locations_by_zip", exc)
            try:
                locations = await self._locations_via_playwright(zip_code, radius_miles)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "costco",
                    "find_locations_by_zip",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "costco",
                "find_locations_by_zip",
                "fallback_success",
                result_count=len(locations),
            )
            return locations
        record_json_success(
            logger,
            "costco",
            "find_locations_by_zip",
            result_count=len(locations),
        )
        return locations

    @retry_json("costco", "find_locations_by_zip", logger)
    async def _json_find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        client = await self._client()
        params: dict[str, str] = {
            **_BASE_PARAMS,
            "numOfWarehouses": "10",
            "countryCode": "US",
            "operation": "nearbyWarehouses",
            # TODO(reverse-engineer): ZIP → lat/lon geocoding required for real call.
            # For now pass zipCode directly and hope the endpoint accepts it.
            "zipCode": zip_code,
            "radius": str(radius_miles),
        }
        response = await client.get(_WAREHOUSE_URL, params=params, headers=_DEFAULT_HEADERS)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        warehouses: list[dict[str, Any]] = payload.get("warehouseList", [])
        return [self._parse_location(w) for w in warehouses]

    async def _locations_via_playwright(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        """Playwright fallback for warehouse finder.

        TODO(reverse-engineer): implement once cookies are captured.
        The warehouse-finder page at https://www.costco.com/warehouse-locations
        renders warehouse data in a ``<script>`` tag — parse after page load.
        Required: ``whloc`` cookie for preferred warehouse context.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Costco locations) — see reverse-engineering notes. "
            "Requires captured whloc cookie and confirmed page structure."
        )

    @staticmethod
    def _parse_location(data: dict[str, Any]) -> StoreLocation:
        return StoreLocation(
            id=f"costco-{data['warehouseId']}",
            retailer="costco",
            store_id=str(data["warehouseId"]),
            name=data.get("displayName", "Costco Wholesale"),
            address=", ".join(
                part
                for part in [
                    data.get("addr1"),
                    data.get("city"),
                    data.get("state"),
                ]
                if part
            ),
            zip=data.get("zipCode", ""),
            lat=float(data.get("latitude", 0.0)),
            lon=float(data.get("longitude", 0.0)),
            fulfillment_zone=None,
            metadata={"phone": data.get("phoneNumber", "")},
        )

    async def search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search for products at a Costco warehouse.

        JSON-primary path: calls ``AjaxCatalogSearchResultView``.
        Falls through to Playwright on failure.
        Membership-only SKUs are flagged in ``PriceQuote.raw["membership_required"]``.

        Args:
            store_location_id: Costco warehouse ID (e.g. ``"costco-1234"`` or ``"1234"``).
            term: Search query string.
            limit: Maximum results to return (default 20).

        Returns:
            List of PriceQuote objects.
        """
        try:
            quotes = await self._json_search_products(store_location_id, term, limit)
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            record_json_failure(logger, "costco", "search_products", exc)
            record_fallback_attempt(logger, "costco", "search_products", exc)
            try:
                quotes = await self._search_via_playwright(store_location_id, term, limit)
            except Exception as fallback_exc:
                record_fallback_result(
                    logger,
                    "costco",
                    "search_products",
                    "fallback_failure",
                    exc=fallback_exc,
                )
                raise
            record_fallback_result(
                logger,
                "costco",
                "search_products",
                "fallback_success",
                result_count=len(quotes),
            )
            return quotes
        record_json_success(
            logger,
            "costco",
            "search_products",
            result_count=len(quotes),
        )
        return quotes

    @retry_json("costco", "search_products", logger)
    async def _json_search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        raw_id = store_location_id.removeprefix("costco-")
        client = await self._client()
        params: dict[str, str] = {
            **_BASE_PARAMS,
            "keyword": term,
            "pageSize": str(limit),
            "whloc": raw_id,
        }
        response = await client.get(_SEARCH_URL, params=params, headers=_DEFAULT_HEADERS)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        entries: list[dict[str, Any]] = payload.get("catalogEntryList", [])
        return [self._parse_product(store_location_id, e) for e in entries]

    async def _search_via_playwright(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        """Playwright fallback for product search.

        TODO(reverse-engineer): implement once session details are confirmed.
        Search results at https://www.costco.com/CatalogSearch?keyword=<term>
        embed product JSON in ``<script>`` tags.
        Required: ``whloc`` cookie set to the target warehouse ID.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Costco search) — see reverse-engineering notes. "
            "Requires whloc cookie and confirmed search page structure."
        )

    @staticmethod
    def _parse_product(store_location_id: str, data: dict[str, Any]) -> PriceQuote:
        ident = (
            data.get("catalogEntryIdentifier", {})
            .get("externalIdentifier", {})
            .get("partNumber", "")
        )
        descriptions: list[dict[str, Any]] = data.get("description", [{}])
        desc = descriptions[0] if descriptions else {}
        prices: list[dict[str, Any]] = data.get("price", [{}])
        price_entry = prices[0] if prices else {}
        attrs: dict[str, Any] = data.get("attributes", {})

        price_str = price_entry.get("contractPrice") or price_entry.get("unitPrice") or "0"
        price_cents = round(float(price_str) * 100)

        membership_required = str(attrs.get("isMemberOnly", "false")).lower() == "true"

        return PriceQuote(
            retailer="costco",
            store_location_id=store_location_id,
            retailer_sku=str(ident),
            canonical_product_id_hint=None,
            title=desc.get("name", ""),
            brand=attrs.get("brand") or None,
            size_raw=desc.get("shortDescription") or None,
            price_cents=price_cents,
            was_on_promo=False,  # TODO(reverse-engineer): confirm promo field name
            promo_price_cents=None,
            url=None,
            raw={**data, "membership_required": membership_required},
            source_tier="json",
        )
