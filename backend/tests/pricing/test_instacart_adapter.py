"""Tests for the Instacart adapter."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters._guard import UnofficialIngestionDisabledError
from allaroundfood.pricing.adapters.instacart import InstacartAdapter

FIXTURES = Path(__file__).parent.parent / "fixtures" / "instacart"

RETAILERS_URL = "https://www.instacart.com/api/v2/stores"
SEARCH_URL = "https://www.instacart.com/api/v2/search_v3/search"


def _load_fixture(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Kill-switch
# ---------------------------------------------------------------------------


def test_kill_switch_raises_on_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    """InstacartAdapter.__init__ must raise when kill-switch env is true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError):
        InstacartAdapter()


def test_kill_switch_allows_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = InstacartAdapter()
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
        respx.get(RETAILERS_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert len(locs) == 2
    assert locs[0].retailer == "instacart"
    assert locs[0].store_id == "smiths"


@pytest.mark.asyncio
async def test_find_locations_parses_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(RETAILERS_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert "South Jordan" in locs[0].address
    assert locs[0].lat == pytest.approx(40.5561, abs=0.01)


@pytest.mark.asyncio
async def test_find_locations_sets_instacart_retailer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """All Instacart locations must carry retailer='instacart'."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(RETAILERS_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert all(loc.retailer == "instacart" for loc in locs)


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
            adapter = InstacartAdapter(http_client=client)
            quotes = await adapter.search_products("instacart-smiths", "milk")

    assert len(quotes) == 2
    assert quotes[0].retailer == "instacart"
    assert quotes[0].retailer_sku == "item_1234567"
    assert quotes[0].price_cents == 449
    assert quotes[0].was_on_promo is False


@pytest.mark.asyncio
async def test_search_products_detects_promo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            quotes = await adapter.search_products("instacart-smiths", "milk")

    # Second product: promo=true, price=3.99, original=4.99
    # Convention: price_cents = sale price customer pays; promo_price_cents = same sale price.
    promo_quote = quotes[1]
    assert promo_quote.was_on_promo is True
    assert promo_quote.price_cents == 399  # customer pays sale price
    assert promo_quote.promo_price_cents == 399  # equals price_cents when on promo
    assert promo_quote.raw["original_price_cents"] == 499  # original stored in raw


@pytest.mark.asyncio
async def test_search_products_tracks_source_retailer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each PriceQuote must carry raw['source_retailer'] from the underlying retailer."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            quotes = await adapter.search_products("instacart-smiths", "milk")

    assert quotes[0].raw["source_retailer"] == "smiths"
    assert quotes[1].raw["source_retailer"] == "smiths"


@pytest.mark.asyncio
async def test_search_products_builds_instacart_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = InstacartAdapter(http_client=client)
            quotes = await adapter.search_products("instacart-smiths", "milk")

    assert quotes[0].url == "https://www.instacart.com/store/smiths/products/1234567"


# ---------------------------------------------------------------------------
# Playwright fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_locations_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = InstacartAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._locations_via_playwright("84065", 10)


@pytest.mark.asyncio
async def test_search_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = InstacartAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._search_via_playwright("instacart-smiths", "milk", 20)
