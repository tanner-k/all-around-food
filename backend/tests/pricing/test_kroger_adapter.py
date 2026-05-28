"""Tests for the Kroger adapter."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters.kroger import KrogerAdapter

FIXTURES = Path(__file__).parent.parent / "fixtures" / "kroger"

TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
LOCATIONS_URL = "https://api.kroger.com/v1/locations"
PRODUCTS_URL = "https://api.kroger.com/v1/products"


def _load_fixture(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Token fetch + caching
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_access_token_fetches_token() -> None:
    token_payload = _load_fixture("token.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            token = await adapter.get_access_token()
    assert token == "test-access-token-abc123"


@pytest.mark.asyncio
async def test_get_access_token_cached() -> None:
    """Second call must NOT hit the network again while token is fresh."""
    token_payload = _load_fixture("token.json")
    async with respx.mock:
        route = respx.post(TOKEN_URL).mock(
            return_value=httpx.Response(200, json=token_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            t1 = await adapter.get_access_token()
            t2 = await adapter.get_access_token()
    assert t1 == t2
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_get_access_token_refreshes_when_expired() -> None:
    """Token must be re-fetched after expiry."""
    expired_payload = {
        "access_token": "old-token",
        "token_type": "bearer",
        "expires_in": 0,  # already expired
    }
    fresh_payload = _load_fixture("token.json")
    async with respx.mock:
        route = respx.post(TOKEN_URL).mock(
            side_effect=[
                httpx.Response(200, json=expired_payload),
                httpx.Response(200, json=fresh_payload),
            ]
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            # First call gets expired token; cache should detect expiry
            await adapter.get_access_token()
            # Manually push expiry into the past to force refresh
            adapter._token_expiry = time.time() - 1  # type: ignore[attr-defined]
            t2 = await adapter.get_access_token()
    assert t2 == "test-access-token-abc123"
    assert route.call_count == 2


# ---------------------------------------------------------------------------
# find_locations_by_zip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_locations_by_zip_returns_store_locations() -> None:
    token_payload = _load_fixture("token.json")
    locations_payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(LOCATIONS_URL).mock(
            return_value=httpx.Response(200, json=locations_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert len(locs) == 2
    assert locs[0].store_id == "02100440"
    assert locs[0].retailer == "kroger"
    assert locs[0].zip == "84065"
    assert locs[0].lat == pytest.approx(40.503746, abs=0.01)


@pytest.mark.asyncio
async def test_find_locations_maps_address_fields() -> None:
    token_payload = _load_fixture("token.json")
    locations_payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(LOCATIONS_URL).mock(
            return_value=httpx.Response(200, json=locations_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert "Riverton" in locs[0].name
    assert locs[0].address != ""


# ---------------------------------------------------------------------------
# search_products
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_products_returns_price_quotes() -> None:
    token_payload = _load_fixture("token.json")
    products_payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(PRODUCTS_URL).mock(
            return_value=httpx.Response(200, json=products_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            quotes = await adapter.search_products("02100440", "milk")

    assert len(quotes) == 2
    assert quotes[0].retailer == "kroger"
    assert quotes[0].price_cents == 499
    assert quotes[0].brand == "Kroger"
    assert quotes[0].was_on_promo is False


@pytest.mark.asyncio
async def test_search_products_detects_promo() -> None:
    token_payload = _load_fixture("token.json")
    products_payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(PRODUCTS_URL).mock(
            return_value=httpx.Response(200, json=products_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            quotes = await adapter.search_products("02100440", "milk")

    # Second product has promo price 5.99 vs regular 7.49
    organic = quotes[1]
    assert organic.was_on_promo is True
    assert organic.promo_price_cents == 599


@pytest.mark.asyncio
async def test_search_products_no_promo_when_promo_is_zero() -> None:
    token_payload = _load_fixture("token.json")
    products_payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(PRODUCTS_URL).mock(
            return_value=httpx.Response(200, json=products_payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            quotes = await adapter.search_products("02100440", "milk")

    # First product has promo=0 — not on promo
    assert quotes[0].was_on_promo is False
    assert quotes[0].promo_price_cents is None


# ---------------------------------------------------------------------------
# Retry on 5xx
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_on_5xx() -> None:
    """Adapter must retry up to 3 times on 5xx responses."""
    token_payload = _load_fixture("token.json")
    products_payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(PRODUCTS_URL).mock(
            side_effect=[
                httpx.Response(500, json={"error": "Internal Server Error"}),
                httpx.Response(500, json={"error": "Internal Server Error"}),
                httpx.Response(200, json=products_payload),
            ]
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            quotes = await adapter.search_products("02100440", "milk")

    assert len(quotes) == 2


@pytest.mark.asyncio
async def test_retry_on_429() -> None:
    """Adapter must retry on 429 rate-limit responses."""
    token_payload = _load_fixture("token.json")
    products_payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=token_payload))
        respx.get(PRODUCTS_URL).mock(
            side_effect=[
                httpx.Response(429, json={"error": "Rate limited"}),
                httpx.Response(200, json=products_payload),
            ]
        )
        async with httpx.AsyncClient() as client:
            adapter = KrogerAdapter("id", "secret", http_client=client)
            quotes = await adapter.search_products("02100440", "milk")

    assert len(quotes) == 2


# ---------------------------------------------------------------------------
# Live integration test (skipped by default)
# ---------------------------------------------------------------------------


@pytest.mark.network
@pytest.mark.asyncio
async def test_live_kroger_token() -> None:
    """Live test: requires KROGER_CLIENT_ID + KROGER_CLIENT_SECRET env vars."""
    import os

    client_id = os.environ.get("KROGER_CLIENT_ID")
    client_secret = os.environ.get("KROGER_CLIENT_SECRET")
    if not client_id or not client_secret:
        pytest.skip("KROGER_CLIENT_ID / KROGER_CLIENT_SECRET not set")

    async with httpx.AsyncClient() as client:
        adapter = KrogerAdapter(client_id, client_secret, http_client=client)
        token = await adapter.get_access_token()
    assert len(token) > 10
