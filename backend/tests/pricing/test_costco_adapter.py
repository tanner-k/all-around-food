"""Tests for the Costco adapter."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters._guard import UnofficialIngestionDisabledError
from allaroundfood.pricing.adapters.costco import CostcoAdapter

FIXTURES = Path(__file__).parent.parent / "fixtures" / "costco"

WAREHOUSE_URL = "https://www.costco.com/AjaxWarehouseBrowseLookupView"
SEARCH_URL = "https://www.costco.com/AjaxCatalogSearchResultView"


def _load_fixture(name: str) -> dict:  # type: ignore[type-arg]
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Kill-switch
# ---------------------------------------------------------------------------


def test_kill_switch_raises_on_instantiation(monkeypatch: pytest.MonkeyPatch) -> None:
    """CostcoAdapter.__init__ must raise when kill-switch env is true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError):
        CostcoAdapter()


def test_kill_switch_allows_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = CostcoAdapter()
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
        respx.get(WAREHOUSE_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = CostcoAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert len(locs) == 2
    assert locs[0].retailer == "costco"
    assert locs[0].store_id == "1234"


@pytest.mark.asyncio
async def test_find_locations_parses_address(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("locations_84065.json")
    async with respx.mock:
        respx.get(WAREHOUSE_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = CostcoAdapter(http_client=client)
            locs = await adapter.find_locations_by_zip("84065")

    assert "Bountiful" in locs[0].address
    assert locs[0].lat == pytest.approx(40.895512, abs=0.01)


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
            adapter = CostcoAdapter(http_client=client)
            quotes = await adapter.search_products("costco-1234", "milk")

    assert len(quotes) == 2
    assert quotes[0].retailer == "costco"
    assert quotes[0].retailer_sku == "789012"
    assert quotes[0].price_cents == 1249
    assert quotes[0].brand == "Kirkland Signature"


@pytest.mark.asyncio
async def test_search_products_flags_membership_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = CostcoAdapter(http_client=client)
            quotes = await adapter.search_products("costco-1234", "milk")

    # First product: isMemberOnly=false
    assert quotes[0].raw["membership_required"] is False
    # Second product: isMemberOnly=true
    assert quotes[1].raw["membership_required"] is True


@pytest.mark.asyncio
async def test_search_products_strips_costco_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    payload = _load_fixture("products_milk.json")
    async with respx.mock:
        route = respx.get(SEARCH_URL).mock(
            return_value=httpx.Response(200, json=payload)
        )
        async with httpx.AsyncClient() as client:
            adapter = CostcoAdapter(http_client=client)
            await adapter.search_products("costco-1234", "milk")

    assert route.call_count == 1


# ---------------------------------------------------------------------------
# Playwright fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_locations_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = CostcoAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._locations_via_playwright("84065", 10)


@pytest.mark.asyncio
async def test_search_playwright_fallback_raises_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = CostcoAdapter()
    with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
        await adapter._search_via_playwright("costco-1234", "milk", 20)
