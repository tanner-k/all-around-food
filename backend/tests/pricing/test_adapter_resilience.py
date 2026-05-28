"""Tests for shared retailer adapter resilience behavior."""

from __future__ import annotations

import logging
from pathlib import Path

import httpx
import pytest
import respx

from allaroundfood.pricing.adapters._resilience import (
    adapter_counter_snapshot,
    reset_adapter_counters,
)
from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.adapters.walmart import WalmartAdapter
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.ingestion import IngestionPipeline
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore

SEARCH_URL = "https://www.walmart.com/search/api"


@pytest.fixture(autouse=True)
def _reset_counters() -> None:
    reset_adapter_counters()


@pytest.mark.asyncio
async def test_json_success_records_counter_and_structured_log(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    caplog.set_level(logging.INFO)
    payload = {
        "payload": {
            "items": [
                {
                    "usItemId": "sku-1",
                    "name": "Milk",
                    "brand": "Dairy",
                    "salePrice": 3.99,
                    "priceInfo": {"currentPrice": {"price": 3.99}},
                }
            ]
        }
    }
    async with respx.mock:
        respx.get(SEARCH_URL).mock(return_value=httpx.Response(200, json=payload))
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            quotes = await adapter.search_products("walmart-2648", "milk")

    assert len(quotes) == 1
    assert quotes[0].source_tier == "json"
    snapshot = adapter_counter_snapshot()
    assert snapshot["walmart"]["search_products"]["json_success"] == 1
    assert any(
        record.message == "adapter_event"
        and getattr(record, "adapter_name", None) == "walmart"
        and getattr(record, "adapter_operation", None) == "search_products"
        and getattr(record, "adapter_event", None) == "json_success"
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_rate_limit_retries_exhaust_before_playwright_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    async with respx.mock:
        route = respx.get(SEARCH_URL).mock(
            side_effect=[
                httpx.Response(
                    429,
                    json={"error": "rate limited"},
                    headers={"Retry-After": "0"},
                ),
                httpx.Response(
                    429,
                    json={"error": "rate limited"},
                    headers={"Retry-After": "0"},
                ),
                httpx.Response(
                    429,
                    json={"error": "rate limited"},
                    headers={"Retry-After": "0"},
                ),
            ]
        )
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
                await adapter.search_products("walmart-2648", "milk")

    assert route.call_count == 3
    counters = adapter_counter_snapshot()["walmart"]["search_products"]
    assert counters["json_retry"] == 2
    assert counters["json_failure"] == 1
    assert counters["fallback_attempt"] == 1
    assert counters["fallback_failure"] == 1
    assert counters["rate_limit"] == 3


@pytest.mark.asyncio
async def test_server_error_retries_before_playwright_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    async with respx.mock:
        route = respx.get(SEARCH_URL).mock(
            side_effect=[
                httpx.Response(503, json={"error": "unavailable"}),
                httpx.Response(503, json={"error": "unavailable"}),
                httpx.Response(503, json={"error": "unavailable"}),
            ]
        )
        async with httpx.AsyncClient() as client:
            adapter = WalmartAdapter(http_client=client)
            with pytest.raises(NotImplementedError, match="Playwright fallback pending"):
                await adapter.search_products("walmart-2648", "milk")

    assert route.call_count == 3
    counters = adapter_counter_snapshot()["walmart"]["search_products"]
    assert counters["json_retry"] == 2
    assert counters["json_failure"] == 1
    assert counters["fallback_attempt"] == 1
    assert counters["fallback_failure"] == 1


def test_price_quote_source_tier_overrides_legacy_ingestion_default(
    tmp_path: Path,
) -> None:
    svc = FakeEmbeddingService()
    canonical_store = CanonicalProductStore(tmp_path / "canon.parquet")
    pipeline = IngestionPipeline(
        matcher=CanonicalMatcher(svc, canonical_store),
        embedding=svc,
        canonical_store=canonical_store,
        sku_store=RetailerSKUStore(tmp_path / "sku.parquet"),
        observation_store=PriceObservationStore(tmp_path / "obs.parquet"),
    )
    quote = PriceQuote(
        retailer="walmart",
        store_location_id="store-1",
        retailer_sku="sku-1",
        canonical_product_id_hint=None,
        title="Milk",
        brand=None,
        size_raw=None,
        price_cents=399,
        was_on_promo=False,
        promo_price_cents=None,
        url=None,
        raw={},
        source_tier="browser",
    )

    _, _, _, observations = pipeline.ingest("walmart", "store-1", [quote])

    assert observations.all()[0].source_tier == "browser"
