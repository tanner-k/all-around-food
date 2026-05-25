"""Tests for the ingestion pipeline.

Uses FakeEmbeddingService and in-memory stores (no disk I/O).
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.ingestion import IngestionPipeline
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore

_NOW = datetime(2025, 6, 1, 12, 0, 0, tzinfo=UTC)
_CANON_PATH = Path("/tmp/test_ingest_canon.parquet")
_SKU_PATH = Path("/tmp/test_ingest_sku.parquet")
_OBS_PATH = Path("/tmp/test_ingest_obs.parquet")
_STORE_LOC_ID = "loc-001"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_canon(
    canon_id: str,
    name: str,
    brand: str | None = None,
    gtin: str | None = None,
) -> CanonicalProduct:
    svc = FakeEmbeddingService()
    text = f"{brand or ''} {name}".strip()
    return CanonicalProduct(
        id=canon_id,
        gtin=gtin,
        brand=brand,
        name=name,
        size_value=None,
        size_unit=None,
        category=None,
        attributes={},
        embedding=svc.embed_one(text).tolist(),
        created_at=_NOW,
        updated_at=_NOW,
    )


def _make_quote(
    title: str,
    retailer: str = "walmart",
    sku: str | None = None,
    brand: str | None = None,
    gtin: str | None = None,
    price_cents: int = 299,
) -> PriceQuote:
    raw: dict[str, object] = {"source": "test"}
    if gtin:
        raw["gtin"] = gtin
    return PriceQuote(
        retailer=retailer,
        store_location_id=_STORE_LOC_ID,
        retailer_sku=sku or f"sku-{title[:8].lower().replace(' ', '-')}",
        canonical_product_id_hint=None,
        title=title,
        brand=brand,
        size_raw=None,
        price_cents=price_cents,
        was_on_promo=False,
        promo_price_cents=None,
        url=None,
        raw=raw,
    )


def _make_pipeline(
    svc: FakeEmbeddingService,
    canonical_store: CanonicalProductStore,
    sku_store: RetailerSKUStore | None = None,
    observation_store: PriceObservationStore | None = None,
    threshold: float = 0.85,
    fuzzy_threshold: int = 90,
) -> IngestionPipeline:
    matcher = CanonicalMatcher(svc, canonical_store, threshold=threshold, fuzzy_threshold=fuzzy_threshold)
    return IngestionPipeline(
        matcher=matcher,
        embedding=svc,
        canonical_store=canonical_store,
        sku_store=sku_store or RetailerSKUStore(_SKU_PATH),
        observation_store=observation_store or PriceObservationStore(_OBS_PATH),
        now=lambda: _NOW,
    )


# ---------------------------------------------------------------------------
# Seed canonical store with 3 products (2 will be matched, 1 won't be used)
# ---------------------------------------------------------------------------


@pytest.fixture()
def seeded_canonical() -> CanonicalProductStore:
    store = CanonicalProductStore(_CANON_PATH)
    # These two will be matched via embedding
    for p in [
        _make_canon("c1", "Whole Milk 1 Gallon", brand="Great Value"),
        _make_canon("c2", "Orange Juice 52 fl oz", brand="Tropicana"),
        _make_canon("c3", "Unrelated Product XYZ", brand="SomeBrand"),
    ]:
        store = store.add(p)
    return store


@pytest.fixture()
def gtin_canonical() -> CanonicalProductStore:
    store = CanonicalProductStore(_CANON_PATH)
    store = store.add(_make_canon("g1", "Cheerios Cereal 18 oz", brand="General Mills", gtin="099999999999"))
    return store


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_ingest_five_quotes_produces_correct_counts(
    seeded_canonical: CanonicalProductStore,
) -> None:
    """2 quotes match existing canonicals via embedding, 1 via GTIN (separate store),
    2 are new — but for simplicity we use one store and test totals."""
    svc = FakeEmbeddingService()

    quotes = [
        # Will match c1 via embedding (identical text)
        _make_quote("Whole Milk 1 Gallon", brand="Great Value", sku="sku-milk"),
        # Will match c2 via embedding (identical text)
        _make_quote("Orange Juice 52 fl oz", brand="Tropicana", sku="sku-oj"),
        # New — no match
        _make_quote("Sourdough Bread Loaf", brand="Daves Killer Bread", sku="sku-bread"),
        # New — no match
        _make_quote("Baby Spinach 5 oz", brand="Earthbound Farm", sku="sku-spinach"),
        # New — no match
        _make_quote("Cheddar Cheese 16 oz", brand="Tillamook", sku="sku-cheese"),
    ]

    pipeline = _make_pipeline(svc, seeded_canonical)
    result, new_can, new_sku, new_obs = pipeline.ingest("walmart", _STORE_LOC_ID, quotes)

    assert result.quotes_processed == 5
    assert result.observations_written == 5
    # 3 new canonicals (bread, spinach, cheese)
    assert result.canonical_products_created == 3
    # 5 SKUs upserted (all new on first run)
    assert result.skus_upserted == 5
    # 5 observations in the new store
    assert len(new_obs.all()) == 5


def test_ingest_with_gtin_match(
    gtin_canonical: CanonicalProductStore,
) -> None:
    svc = FakeEmbeddingService()
    quotes = [
        _make_quote(
            "Cheerios Cereal",
            retailer="kroger",
            brand="General Mills",
            sku="sku-cer",
            gtin="099999999999",
        ),
    ]
    pipeline = _make_pipeline(svc, gtin_canonical)
    result, new_can, new_sku, new_obs = pipeline.ingest("kroger", _STORE_LOC_ID, quotes)

    assert result.canonical_products_created == 0
    assert result.match_method_counts.get("upc", 0) == 1
    assert len(new_obs.all()) == 1
    # Kroger → source_tier = "api"
    obs = new_obs.all()[0]
    assert obs.source_tier == "api"


def test_kroger_source_tier_is_api(
    seeded_canonical: CanonicalProductStore,
) -> None:
    svc = FakeEmbeddingService()
    quotes = [_make_quote("Whole Milk 1 Gallon", retailer="kroger", brand="Great Value", sku="sku-milk-k")]
    pipeline = _make_pipeline(svc, seeded_canonical)
    _, _, _, new_obs = pipeline.ingest("kroger", _STORE_LOC_ID, quotes)
    assert new_obs.all()[0].source_tier == "api"


def test_non_kroger_source_tier_is_json(
    seeded_canonical: CanonicalProductStore,
) -> None:
    svc = FakeEmbeddingService()
    quotes = [_make_quote("Whole Milk 1 Gallon", retailer="walmart", brand="Great Value", sku="sku-milk-w")]
    pipeline = _make_pipeline(svc, seeded_canonical)
    _, _, _, new_obs = pipeline.ingest("walmart", _STORE_LOC_ID, quotes)
    assert new_obs.all()[0].source_tier == "json"


def test_sku_upsert_updates_last_seen_at(
    seeded_canonical: CanonicalProductStore,
) -> None:
    """Running ingest twice with same SKU should update last_seen_at, not add a second row."""
    svc = FakeEmbeddingService()
    quotes = [_make_quote("Whole Milk 1 Gallon", brand="Great Value", sku="sku-milk")]

    pipeline1 = _make_pipeline(svc, seeded_canonical)
    _, new_can, new_sku, new_obs = pipeline1.ingest("walmart", _STORE_LOC_ID, quotes)

    assert len(new_sku.all()) == 1

    # Second ingest with the same SKU
    later = datetime(2025, 6, 2, 12, 0, 0, tzinfo=UTC)
    pipeline2 = IngestionPipeline(
        matcher=CanonicalMatcher(svc, new_can, threshold=0.85, fuzzy_threshold=90),
        embedding=svc,
        canonical_store=new_can,
        sku_store=new_sku,
        observation_store=new_obs,
        now=lambda: later,
    )
    _, _, new_sku2, _ = pipeline2.ingest("walmart", _STORE_LOC_ID, quotes)

    # Still only 1 SKU (upserted, not duplicated)
    all_skus = new_sku2.all()
    assert len(all_skus) == 1
    assert all_skus[0].last_seen_at == later


def test_input_stores_are_not_mutated(
    seeded_canonical: CanonicalProductStore,
) -> None:
    svc = FakeEmbeddingService()
    original_canon_count = len(seeded_canonical.all())
    orig_sku_store = RetailerSKUStore(_SKU_PATH)
    orig_obs_store = PriceObservationStore(_OBS_PATH)

    quotes = [_make_quote("New Product Never Seen", brand="Brand X", sku="sku-new")]
    pipeline = _make_pipeline(svc, seeded_canonical, orig_sku_store, orig_obs_store)
    pipeline.ingest("walmart", _STORE_LOC_ID, quotes)

    # Inputs should be unchanged
    assert len(seeded_canonical.all()) == original_canon_count
    assert len(orig_sku_store.all()) == 0
    assert len(orig_obs_store.all()) == 0


def test_raw_response_hash_is_deterministic(
    seeded_canonical: CanonicalProductStore,
) -> None:
    """Same raw dict → same hash across two ingest runs."""
    svc = FakeEmbeddingService()
    raw: dict[str, object] = {"price": 299, "name": "Milk"}
    q = PriceQuote(
        retailer="walmart",
        store_location_id=_STORE_LOC_ID,
        retailer_sku="sku-hash-test",
        canonical_product_id_hint=None,
        title="Whole Milk 1 Gallon",
        brand="Great Value",
        size_raw=None,
        price_cents=299,
        was_on_promo=False,
        promo_price_cents=None,
        url=None,
        raw=raw,
    )

    pipeline = _make_pipeline(svc, seeded_canonical)
    _, _, _, obs1 = pipeline.ingest("walmart", _STORE_LOC_ID, [q])

    pipeline2 = _make_pipeline(svc, seeded_canonical)
    _, _, _, obs2 = pipeline2.ingest("walmart", _STORE_LOC_ID, [q])

    assert obs1.all()[0].raw_response_hash == obs2.all()[0].raw_response_hash
