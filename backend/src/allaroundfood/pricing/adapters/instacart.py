"""Instacart storefront adapter (unofficial — reverse-engineered JSON endpoint).

.. warning::
    This adapter is **unofficial** and personal-use only.  It is gated by the
    ``DISABLE_UNOFFICIAL_INGESTION`` environment variable (default: enabled).
    See ADR 0003 for the personal-use posture and ToS acknowledgment.

Reverse-engineering notes
--------------------------
All notes below are based on traffic analysis with browser DevTools.
No live session has been captured yet — see TODO items.

Instacart aggregates multiple retailer storefronts.  Each ``PriceQuote`` tags
``raw["source_retailer"]`` with the underlying retailer (e.g. ``"smiths"``,
``"costco"``, ``"kroger"``).  ``PriceQuote.retailer`` is always ``"instacart"``.

**Store (retailer storefront) lookup endpoint** (JSON-primary)::

    GET https://www.instacart.com/v3/retailers/<retailer_slug>/nearby?
        postal_code=<zip>
    OR:
    GET https://www.instacart.com/api/v2/stores?
        postal_code=<zip>
        radius=<miles>

    TODO(reverse-engineer): confirm exact endpoint and param names from a live capture.
    Some community reports suggest ``/v3/retailers`` accepts a ``location`` param.

Expected cookies::

    postal_code=<zip>          # user's delivery ZIP — required for store resolution
    shopper_id=<id>            # guest/logged-in shopper ID
    csrf_token=<token>         # CSRF — usually in response Set-Cookie

    TODO(reverse-engineer): capture live cookie values from a real browser session.

**Product search endpoint** (JSON-primary)::

    GET https://www.instacart.com/api/v2/search_v3/search?
        query=<term>
        source=<retailer_slug>   # e.g. "smiths", "costco"
        retailer_id=<id>
        num_results=<limit>
        postal_code=<zip>

    TODO(reverse-engineer): confirm query param names and response envelope.

Request headers::

    X-CSRFToken: <csrf_token from cookie>
    Accept: application/json
    Referer: https://www.instacart.com/store/<retailer_slug>/search_v3?query=<term>

    TODO(reverse-engineer): confirm CSRF header name and whether ``X-Instacart-Key``
    or ``Authorization: Bearer`` is needed for newer sessions.

**Placeholder JSON shapes** (synthetic, well-formed based on observed patterns)::

    Store listing response:
    {
      "retailers": [
        {
          "id": "smiths",
          "name": "Smith's Food & Drug",
          "slug": "smiths",
          "retailer_id": 155,
          "logo_url": "https://d2lnr5mha7bycj.cloudfront.net/...",
          "nearest_store": {
            "address": "11180 S Redwood Rd",
            "city": "South Jordan",
            "state": "UT",
            "zip": "84095",
            "lat": 40.5561,
            "lng": -111.9290
          }
        }
      ]
    }

    Product search response:
    {
      "data": {
        "productsForSearch": {
          "products": [
            {
              "id": "item_1234567",
              "name": "Lucerne Whole Milk, 1 Gallon",
              "brand_name": "Lucerne",
              "size": "1 gal",
              "pricing": {
                "price": "4.49",
                "original_price": "4.99",
                "promo": true,
                "promo_description": "Sale"
              },
              "image_url": "https://d2lnr5mha7bycj.cloudfront.net/...",
              "product_page_path": "/store/smiths/products/12345",
              "retailer_reference_code": "item_1234567",
              "source_retailer": "smiths"
            }
          ]
        }
      }
    }
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from allaroundfood.pricing.adapters._guard import unofficial_only
from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.models import StoreLocation

logger = logging.getLogger(__name__)

_INSTACART_BASE = "https://www.instacart.com"
_RETAILERS_URL = f"{_INSTACART_BASE}/api/v2/stores"
_SEARCH_URL = f"{_INSTACART_BASE}/api/v2/search_v3/search"

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

_DEFAULT_HEADERS: dict[str, str] = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    # TODO(reverse-engineer): add X-CSRFToken once live value is captured.
}


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


class InstacartAdapter:
    """Adapter for Instacart multi-retailer storefront product and location data.

    Unofficial — uses reverse-engineered JSON endpoints.  Kill-switch gated via
    ``DISABLE_UNOFFICIAL_INGESTION``.

    Each ``PriceQuote`` carries ``raw["source_retailer"]`` identifying the underlying
    retailer (e.g. ``"smiths"``, ``"costco"``).  ``PriceQuote.retailer`` is always
    ``"instacart"`` to distinguish this adapter's provenance.

    TODO items for live-capture follow-up:
    - Confirm store-listing endpoint URL (``/api/v2/stores`` vs ``/v3/retailers``).
    - Capture ``postal_code``, ``shopper_id``, and ``csrf_token`` cookie values.
    - Confirm product search endpoint and param names (``source`` vs ``retailer_id``).
    - Validate that ``X-CSRFToken`` is required and confirm its header name.
    - Confirm per-retailer ``slug`` values map to ``source_retailer`` in PriceQuote.
    - Check whether ``Authorization: Bearer`` token is issued after login.
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
        """Instacart uses session cookies / CSRF tokens rather than OAuth tokens.

        Returns:
            Empty string — no bearer token; session cookies are used instead.
        """
        return ""

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=2),
        reraise=True,
    )
    async def find_locations_by_zip(
        self,
        zip_code: str,
        radius_miles: int = 10,
    ) -> list[StoreLocation]:
        """Find Instacart retailer storefronts near a ZIP code.

        Each returned StoreLocation represents one Instacart retailer
        available in the given ZIP (e.g. Smith's, Costco, Kroger).

        JSON-primary path: calls ``/api/v2/stores``.
        Falls through to Playwright on failure.

        Args:
            zip_code: US ZIP code to search around.
            radius_miles: Search radius in miles (default 10).

        Returns:
            List of StoreLocation objects (one per retailer storefront).
        """
        client = await self._client()
        try:
            response = await client.get(
                _RETAILERS_URL,
                params={"postal_code": zip_code, "radius": str(radius_miles)},
                headers=_DEFAULT_HEADERS,
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            retailers: list[dict[str, Any]] = payload.get("retailers", [])
            return [self._parse_location(r) for r in retailers]
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            logger.warning("Instacart JSON locations failed (%s); trying Playwright", exc)
            return await self._locations_via_playwright(zip_code, radius_miles)

    async def _locations_via_playwright(
        self,
        zip_code: str,
        radius_miles: int,
    ) -> list[StoreLocation]:
        """Playwright fallback for retailer storefront listing.

        TODO(reverse-engineer): implement once cookies are captured.
        The homepage at https://www.instacart.com renders available retailers
        as a React component — intercept the XHR to ``/api/v2/stores`` after
        setting ``postal_code`` cookie.
        Required: ``postal_code`` cookie, optionally ``shopper_id``.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Instacart locations) — see reverse-engineering notes. "
            "Requires postal_code cookie and confirmed store-listing XHR endpoint."
        )

    @staticmethod
    def _parse_location(data: dict[str, Any]) -> StoreLocation:
        nearest = data.get("nearest_store", {})
        slug = data.get("slug", data.get("id", ""))
        retailer_id = str(data.get("retailer_id", slug))
        return StoreLocation(
            id=f"instacart-{slug}",
            retailer="instacart",
            store_id=slug,
            name=data.get("name", ""),
            address=", ".join(
                part
                for part in [
                    nearest.get("address"),
                    nearest.get("city"),
                    nearest.get("state"),
                ]
                if part
            ),
            zip=nearest.get("zip", ""),
            lat=float(nearest.get("lat", 0.0)),
            lon=float(nearest.get("lng", 0.0)),
            fulfillment_zone=None,
            metadata={"retailer_id": retailer_id, "logo_url": data.get("logo_url", "")},
        )

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=2),
        reraise=True,
    )
    async def search_products(
        self,
        store_location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search for products via the Instacart retailer storefront.

        JSON-primary path: calls ``/api/v2/search_v3/search``.
        Falls through to Playwright on failure.
        Each result's underlying retailer is tracked in ``raw["source_retailer"]``.

        Args:
            store_location_id: Instacart retailer slug (e.g. ``"instacart-smiths"`` or
                ``"smiths"``).  The ``"instacart-"`` prefix is stripped automatically.
            term: Search query string.
            limit: Maximum results to return (default 20).

        Returns:
            List of PriceQuote objects.
        """
        slug = store_location_id.removeprefix("instacart-")
        client = await self._client()
        try:
            response = await client.get(
                _SEARCH_URL,
                params={"query": term, "source": slug, "num_results": str(limit)},
                headers=_DEFAULT_HEADERS,
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            products: list[dict[str, Any]] = (
                payload.get("data", {})
                .get("productsForSearch", {})
                .get("products", [])
            )
            return [self._parse_product(store_location_id, p) for p in products]
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            logger.warning("Instacart JSON search failed (%s); trying Playwright", exc)
            return await self._search_via_playwright(store_location_id, term, limit)

    async def _search_via_playwright(
        self,
        store_location_id: str,
        term: str,
        limit: int,
    ) -> list[PriceQuote]:
        """Playwright fallback for product search.

        TODO(reverse-engineer): implement once session details are confirmed.
        Navigate to https://www.instacart.com/store/<slug>/search_v3?query=<term>
        and intercept the XHR to ``/api/v2/search_v3/search``.
        Required: ``postal_code`` and ``csrf_token`` cookies; ``X-CSRFToken`` header.
        """
        raise NotImplementedError(
            "Playwright fallback pending (Instacart search) — see reverse-engineering notes. "
            "Requires postal_code cookie, csrf_token, and confirmed search XHR URL."
        )

    @staticmethod
    def _parse_product(store_location_id: str, data: dict[str, Any]) -> PriceQuote:
        pricing = data.get("pricing", {})
        price_str = pricing.get("price") or "0"
        original_str = pricing.get("original_price")
        is_promo = bool(pricing.get("promo", False))

        sale_price_cents = round(float(price_str) * 100)
        original_price_cents = (
            round(float(original_str) * 100) if original_str else None
        )

        # Promo when the item is flagged AND has a higher original price.
        # Convention: price_cents = current price customer pays (= sale price on promo).
        # promo_price_cents = sale price when was_on_promo=True; None otherwise.
        was_on_promo = is_promo and (
            original_price_cents is not None and original_price_cents > sale_price_cents
        )
        price_cents = sale_price_cents  # customer always pays the sale price
        promo_price_cents = sale_price_cents if was_on_promo else None

        page_path = data.get("product_page_path")
        url = f"https://www.instacart.com{page_path}" if page_path else None

        source_retailer: str = data.get("source_retailer", "")

        raw_extra: dict[str, Any] = {"source_retailer": source_retailer}
        if was_on_promo and original_price_cents is not None:
            raw_extra["original_price_cents"] = original_price_cents

        return PriceQuote(
            retailer="instacart",
            store_location_id=store_location_id,
            retailer_sku=str(data.get("id", "")),
            canonical_product_id_hint=None,
            title=data.get("name", ""),
            brand=data.get("brand_name") or None,
            size_raw=data.get("size") or None,
            price_cents=price_cents,
            was_on_promo=was_on_promo,
            promo_price_cents=promo_price_cents,
            url=url,
            raw={**data, **raw_extra},
        )
