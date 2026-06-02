"""Tests for the Whole Foods (Amazon) adapter."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters._guard import UnofficialIngestionDisabledError
from allaroundfood.pricing.adapters.whole_foods import WholeFoodsAdapter

FIXTURES = Path(__file__).parent.parent / "fixtures" / "whole_foods"

STORE_GRAPHQL_URL = "https://www.wholefoodsmarket.com/api/graphql"
AMAZON_SEARCH_URL = "https://www.amazon.com/s"


def _load_fixture(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Kill-switch
# ---------------------------------------------------------------------------


def test_kill_switch_raises_on_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    """WholeFoodsAdapter.__init__ must raise when kill-switch env is true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError):
        WholeFoodsAdapter()


def test_kill_switch_allows_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WholeFoodsAdapter()
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
        respx.post(STORE_GRAPHQL_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WholeFoodsAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert len(locs) == 2
    assert locs[0].retailer == "wholefoods"
    assert locs[0].store_id == "wfm-south-jordan-ut"
    assert locs[0].zip == "84095"


@pytest.mark.asyncio
async def test_find_locations_parses_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.post(STORE_GRAPHQL_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WholeFoodsAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert "South Jordan" in locs[0].address
    assert locs[0].lat == pytest.approx(40.557912, abs=0.01)


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
        respx.get(AMAZON_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WholeFoodsAdapter(http_client=client)
            quotes = await adapter.search_products("wholefoods-wfm-south-jordan-ut", "milk")

    assert len(quotes) == 2
    assert quotes[0].retailer == "wholefoods"
    assert quotes[0].retailer_sku == "B07XJY9BBJ"
    assert quotes[0].price_cents == 499


@pytest.mark.asyncio
async def test_search_products_detects_promo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(AMAZON_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WholeFoodsAdapter(http_client=client)
            quotes = await adapter.search_products("wholefoods-wfm-south-jordan-ut", "milk")

    # Second product: salePrice 6.49 < price 7.99 → promo
    promo_quote = quotes[1]
    assert promo_quote.was_on_promo is True
    assert promo_quote.promo_price_cents == 649


@pytest.mark.asyncio
async def test_search_products_builds_amazon_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(AMAZON_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = WholeFoodsAdapter(http_client=client)
            quotes = await adapter.search_products("wholefoods-wfm-south-jordan-ut", "milk")

    assert quotes[0].url == "https://www.amazon.com/dp/B07XJY9BBJ"


# ---------------------------------------------------------------------------
# Playwright fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_locations_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WholeFoodsAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._locations_via_playwright("84065", 10)


@pytest.mark.asyncio
async def test_search_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = WholeFoodsAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._search_via_playwright(
            "wholefoods-wfm-south-jordan-ut", "milk", 20
        )
