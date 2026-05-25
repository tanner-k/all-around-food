"""Kroger retail adapter.

Authenticates via OAuth 2.0 Client Credentials and queries the Kroger
public API for store locations and product prices.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.models import StoreLocation

logger = logging.getLogger(__name__)

_KROGER_BASE = "https://api.kroger.com/v1"
_TOKEN_URL = f"{_KROGER_BASE}/connect/oauth2/token"
_LOCATIONS_URL = f"{_KROGER_BASE}/locations"
_PRODUCTS_URL = f"{_KROGER_BASE}/products"

# Tenacity retry predicate — retry on 5xx and 429
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _is_retryable(exc: BaseException) -> bool:
    """Return True if the exception should trigger a retry."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


class KrogerAdapter:
    """Adapter for the Kroger public developer API.

    Credentials are injected at construction time (from env / Settings).
    An optional ``http_client`` can be provided for testing.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        """Initialise the adapter.

        Args:
            client_id: Kroger API client ID.
            client_secret: Kroger API client secret.
            http_client: Optional pre-configured httpx client (for tests).
        """
        self._client_id = client_id
        self._client_secret = client_secret
        self._http_client = http_client
        self._token: str | None = None
        self._token_expiry: float = 0.0

    async def _client(self) -> httpx.AsyncClient:
        """Return the HTTP client (injected or default)."""
        if self._http_client is not None:
            return self._http_client
        return httpx.AsyncClient()  # pragma: no cover

    async def get_access_token(self) -> str:
        """Return a valid bearer token, fetching or refreshing as needed.

        Uses Client Credentials grant with scope ``product.compact``.
        Caches the token until it is within a few seconds of expiry.

        Returns:
            A valid Kroger bearer token string.

        Raises:
            httpx.HTTPStatusError: If the token request fails.
        """
        if self._token and time.time() < self._token_expiry - 30:
            return self._token

        client = await self._client()
        response = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "scope": "product.compact",
            },
            auth=(self._client_id, self._client_secret),
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        self._token = str(payload["access_token"])
        expires_in = int(payload.get("expires_in", 1800))
        self._token_expiry = time.time() + expires_in
        logger.debug("Kroger token fetched; expires in %d s", expires_in)
        return self._token

    async def _auth_headers(self) -> dict[str, str]:
        token = await self.get_access_token()
        return {"Authorization": f"Bearer {token}"}

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
        """Find Kroger stores near a ZIP code.

        Args:
            zip_code: US ZIP code to search around.
            radius_miles: Search radius in miles (default 10).

        Returns:
            List of StoreLocation objects, one per nearby Kroger store.

        Raises:
            httpx.HTTPStatusError: On non-retryable HTTP errors.
        """
        client = await self._client()
        headers = await self._auth_headers()
        response = await client.get(
            _LOCATIONS_URL,
            headers=headers,
            params={
                "filter.zipCode.near": zip_code,
                "filter.radiusInMiles": str(radius_miles),
                "filter.limit": "10",
            },
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        return [self._parse_location(loc) for loc in payload.get("data", [])]

    @staticmethod
    def _parse_location(data: dict[str, Any]) -> StoreLocation:
        addr = data.get("address", {})
        geo = data.get("geolocation", {})
        zones = data.get("fulfillment", {}).get("zones", [])
        full_address = ", ".join(
            part
            for part in [
                addr.get("addressLine1"),
                addr.get("city"),
                addr.get("state"),
            ]
            if part
        )
        return StoreLocation(
            id=f"kroger-{data['locationId']}",
            retailer="kroger",
            store_id=data["locationId"],
            name=data.get("name", ""),
            address=full_address,
            zip=addr.get("zipCode", ""),
            lat=float(geo.get("latitude", 0.0)),
            lon=float(geo.get("longitude", 0.0)),
            fulfillment_zone=",".join(zones) if zones else None,
            metadata={},
        )

    @retry(
        retry=retry_if_exception(_is_retryable),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.1, min=0.1, max=2),
        reraise=True,
    )
    async def search_products(
        self,
        location_id: str,
        term: str,
        limit: int = 20,
    ) -> list[PriceQuote]:
        """Search for products at a specific Kroger store location.

        Args:
            location_id: Kroger store location ID.
            term: Search query string.
            limit: Maximum results to return (default 20).

        Returns:
            List of PriceQuote objects.

        Raises:
            httpx.HTTPStatusError: On non-retryable HTTP errors.
        """
        client = await self._client()
        headers = await self._auth_headers()
        response = await client.get(
            _PRODUCTS_URL,
            headers=headers,
            params={
                "filter.locationId": location_id,
                "filter.term": term,
                "filter.limit": str(limit),
            },
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
        return [
            self._parse_product(location_id, item)
            for item in payload.get("data", [])
        ]

    @staticmethod
    def _parse_product(location_id: str, data: dict[str, Any]) -> PriceQuote:
        items = data.get("items", [])
        item = items[0] if items else {}
        price_info = item.get("price", {})
        regular_price = float(price_info.get("regular", 0.0))
        promo_price = float(price_info.get("promo", 0.0))

        was_on_promo = promo_price > 0 and promo_price < regular_price
        price_cents = round(regular_price * 100)
        promo_price_cents = round(promo_price * 100) if was_on_promo else None

        return PriceQuote(
            retailer="kroger",
            store_location_id=location_id,
            retailer_sku=data.get("productId", ""),
            canonical_product_id_hint=None,
            title=data.get("description", ""),
            brand=data.get("brand") or None,
            size_raw=item.get("size") or None,
            price_cents=price_cents,
            was_on_promo=was_on_promo,
            promo_price_cents=promo_price_cents,
            url=None,
            raw=data,
        )
