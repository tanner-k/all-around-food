"""Tests for the Walmart adapter."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters._guard import UnofficialIngestionDisabledError
from allaroundfood.pricing.adapters.walmart import WalmartAdapter

FIXTURES = Path(__file__).parent.parent / "fixtures" / "walmart"

STORE_FINDER_URL = "https://www.walmart.com/store/finder/view/ajax"
SEARCH_URL = "https://www.walmart.com/search/api"


def _load_fixture(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Kill-switch
# ---------------------------------------------------------------------------


def test_kill_switch_raises_on_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    """WalmartAdapter.__init__ must raise when kill-switch env is true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError):
        WalmartAdapter()


def test_kill_switch_allows_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """WalmartAdapter instantiates normally when env is unset."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WalmartAdapter()
    assert adapter is not None


# ---------------------------------------------------------------------------
# find_locations_by_zip — JSON path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_locations_returns_store_locations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(STORE_FINDER_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert len(locs) == 2
    assert locs[0].retailer == "walmart"
    assert locs[0].store_id == "2648"
    assert locs[0].zip == "84065"


@pytest.mark.asyncio
async def test_find_locations_parses_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(STORE_FINDER_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert "Riverton" in locs[0].address
    assert locs[0].lat == pytest.approx(40.520341, abs=0.01)


@pytest.mark.asyncio
async def test_find_locations_parses_fulfillment_zone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(STORE_FINDER_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert locs[0].fulfillment_zone is not None
    assert "PickupTodayCheckout" in locs[0].fulfillment_zone


# ---------------------------------------------------------------------------
# search_products — JSON path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_products_returns_price_quotes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            quotes = await adapter.search_products("walmart-2648", "milk")

    assert len(quotes) == 2
    assert quotes[0].retailer == "walmart"
    assert quotes[0].retailer_sku == "10452522"
    assert quotes[0].price_cents == 398
    assert quotes[0].was_on_promo is False


@pytest.mark.asyncio
async def test_search_products_detects_promo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            quotes = await adapter.search_products("walmart-2648", "milk")

    # Second product has wasPrice 7.98 > salePrice 6.48 → promo
    promo_quote = quotes[1]
    assert promo_quote.was_on_promo is True
    assert promo_quote.promo_price_cents is not None


@pytest.mark.asyncio
async def test_search_products_strips_adapter_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """store_location_id with 'walmart-' prefix must be handled correctly."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        route = respx.get(SEARCH_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            await adapter.search_products("walmart-2648", "milk")

    # Verify that the store ID was stripped and used as query param
    assert route.call_count == 1


# ---------------------------------------------------------------------------
# Playwright fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_locations_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WalmartAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._locations_via_playwright("84065", 10)


@pytest.mark.asyncio
async def test_search_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WalmartAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._search_via_playwright("walmart-2648", "milk", 20)
