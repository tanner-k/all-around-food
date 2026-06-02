"""Tests for pricing Parquet repositories."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from allaroundfood.pricing.models import (
    CanonicalProduct,
    PriceObservation,
    RetailerSKU,
    StoreLocation,
)
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore
from allaroundfood.pricing.store.store_location_store import StoreLocationStore

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _store_location(suffix: str = "1") -> StoreLocation:
    return StoreLocation(
        id=f"loc-{suffix}",
        retailer="kroger",
        store_id=f"K{suffix}",
        name=f"Kroger {suffix}",
        address="123 Main St",
        zip="84065",
        lat=40.52,
        lon=-111.94,
        fulfillment_zone=None,
        metadata={"tz": "America/Denver"},
    )


def _canonical_product(suffix: str = "1", with_embedding: bool = False) -> CanonicalProduct:
    now = datetime(2025, 6, 1, tzinfo=UTC)
    return CanonicalProduct(
        id=f"prod-{suffix}",
        gtin="00012345678905",
        brand="BrandX",
        name=f"Product {suffix}",
        size_value=1.0,
        size_unit="gal",
        category="dairy",
        attributes={"sub_category": "milk"},
        embedding=[float(i) / 1000 for i in range(384)] if with_embedding else None,
        created_at=now,
        updated_at=now,
    )


def _retailer_sku(suffix: str = "1") -> RetailerSKU:
    return RetailerSKU(
        id=f"sku-{suffix}",
        canonical_product_id="prod-1",
        retailer="kroger",
        retailer_sku=f"SKU{suffix}",
        url=f"https://kroger.com/p/{suffix}",
        title_raw=f"Kroger Milk {suffix}",
        size_raw="1 gal",
        last_seen_at=datetime(2025, 6, 1, tzinfo=UTC),
        match_method="upc",
        match_confidence=1.0,
        retailer_meta={"department": "dairy"},
    )


def _price_observation(suffix: str = "1") -> PriceObservation:
    return PriceObservation(
        id=f"obs-{suffix}",
        retailer="kroger",
        store_location_id="loc-1",
        retailer_sku_id="sku-1",
        canonical_product_id="prod-1",
        price_cents=499,
        unit_price_cents=None,
        was_on_promo=False,
        observed_at=datetime(2025, 6, 1, tzinfo=UTC),
        source_tier="api",
        raw_response_hash=f"hash{suffix}",
    )


# ---------------------------------------------------------------------------
# StoreLocationStore
# ---------------------------------------------------------------------------


class TestStoreLocationStore:
    def test_empty_load_missing_file(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        store = StoreLocationStore.load(p)
        assert store.all() == []

    def test_add_returns_new_store(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        s0 = StoreLocationStore.load(p)
        loc = _store_location()
        s1 = s0.add(loc)
        # Original unmutated
        assert s0.all() == []
        assert len(s1.all()) == 1

    def test_parquet_roundtrip(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        s1.save()
        s2 = StoreLocationStore.load(p)
        assert s2.all() == [loc]

    def test_get_by_id(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        assert s1.get("loc-1") == loc
        assert s1.get("nonexistent") is None

    def test_update_changes_row_content(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        updated_loc = StoreLocation(
            id="loc-1",
            retailer="kroger",
            store_id="K1",
            name="Kroger Updated",
            address="456 New St",
            zip="84065",
            lat=40.52,
            lon=-111.94,
            fulfillment_zone=None,
            metadata={},
        )
        s2 = s1.update("loc-1", updated_loc)
        assert s2.get("loc-1") == updated_loc

    def test_update_returns_new_instance(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        updated_loc = StoreLocation(
            id="loc-1", retailer="kroger", store_id="K1", name="Kroger Updated",
            address="123 Main St", zip="84065", lat=40.52, lon=-111.94,
            fulfillment_zone=None, metadata={},
        )
        s2 = s1.update("loc-1", updated_loc)
        assert s2 is not s1

    def test_update_original_unchanged(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        updated_loc = StoreLocation(
            id="loc-1", retailer="kroger", store_id="K1", name="Kroger Updated",
            address="123 Main St", zip="84065", lat=40.52, lon=-111.94,
            fulfillment_zone=None, metadata={},
        )
        s1.update("loc-1", updated_loc)
        assert s1.get("loc-1") == loc

    def test_update_missing_id_raises_key_error(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        s0 = StoreLocationStore.load(p)
        with pytest.raises(KeyError):
            s0.update("nonexistent", _store_location())

    def test_multiple_items(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        store = StoreLocationStore.load(p)
        for i in range(3):
            store = store.add(_store_location(str(i)))
        store.save()
        loaded = StoreLocationStore.load(p)
        assert len(loaded.all()) == 3

    def test_metadata_dict_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "store_locations.parquet"
        loc = _store_location()
        s1 = StoreLocationStore.load(p).add(loc)
        s1.save()
        loaded = StoreLocationStore.load(p)
        assert loaded.all()[0].metadata == {"tz": "America/Denver"}


# ---------------------------------------------------------------------------
# CanonicalProductStore
# ---------------------------------------------------------------------------


class TestCanonicalProductStore:
    def test_empty_load_missing_file(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        store = CanonicalProductStore.load(p)
        assert store.all() == []

    def test_add_returns_new_store(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        s0 = CanonicalProductStore.load(p)
        prod = _canonical_product()
        s1 = s0.add(prod)
        assert s0.all() == []
        assert len(s1.all()) == 1

    def test_parquet_roundtrip(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        s1.save()
        s2 = CanonicalProductStore.load(p)
        assert s2.all() == [prod]

    def test_embedding_vector_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product(with_embedding=True)
        assert prod.embedding is not None
        assert len(prod.embedding) == 384
        s1 = CanonicalProductStore.load(p).add(prod)
        s1.save()
        loaded = CanonicalProductStore.load(p)
        restored = loaded.all()[0]
        assert restored.embedding is not None
        assert len(restored.embedding) == 384
        # Check a few values for accuracy
        assert abs(restored.embedding[0] - 0.0) < 1e-5
        assert abs(restored.embedding[1] - 0.001) < 1e-4

    def test_none_embedding_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product(with_embedding=False)
        s1 = CanonicalProductStore.load(p).add(prod)
        s1.save()
        loaded = CanonicalProductStore.load(p)
        assert loaded.all()[0].embedding is None

    def test_attributes_dict_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        s1.save()
        loaded = CanonicalProductStore.load(p)
        assert loaded.all()[0].attributes == {"sub_category": "milk"}

    def test_get_by_id(self, tmp_path: Path) -> None:
        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        assert s1.get("prod-1") == prod
        assert s1.get("nope") is None

    def test_update_changes_row_content(self, tmp_path: Path) -> None:
        from datetime import UTC, datetime

        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        now = datetime(2025, 6, 1, tzinfo=UTC)
        updated = CanonicalProduct(
            id="prod-1", gtin="00012345678905", brand="BrandY", name="Product Updated",
            size_value=2.0, size_unit="gal", category="dairy", attributes={},
            embedding=None, created_at=now, updated_at=now,
        )
        s2 = s1.update("prod-1", updated)
        assert s2.get("prod-1") == updated

    def test_update_returns_new_instance(self, tmp_path: Path) -> None:
        from datetime import UTC, datetime

        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        now = datetime(2025, 6, 1, tzinfo=UTC)
        updated = CanonicalProduct(
            id="prod-1", gtin="00012345678905", brand="BrandY", name="Product Updated",
            size_value=2.0, size_unit="gal", category="dairy", attributes={},
            embedding=None, created_at=now, updated_at=now,
        )
        s2 = s1.update("prod-1", updated)
        assert s2 is not s1

    def test_update_original_unchanged(self, tmp_path: Path) -> None:
        from datetime import UTC, datetime

        p = tmp_path / "canonical_products.parquet"
        prod = _canonical_product()
        s1 = CanonicalProductStore.load(p).add(prod)
        now = datetime(2025, 6, 1, tzinfo=UTC)
        updated = CanonicalProduct(
            id="prod-1", gtin="00012345678905", brand="BrandY", name="Product Updated",
            size_value=2.0, size_unit="gal", category="dairy", attributes={},
            embedding=None, created_at=now, updated_at=now,
        )
        s1.update("prod-1", updated)
        assert s1.get("prod-1") == prod

    def test_update_missing_id_raises_key_error(self, tmp_path: Path) -> None:
        from datetime import UTC, datetime

        p = tmp_path / "canonical_products.parquet"
        s0 = CanonicalProductStore.load(p)
        now = datetime(2025, 6, 1, tzinfo=UTC)
        prod = CanonicalProduct(
            id="nope", gtin="x", brand="x", name="x", size_value=1.0, size_unit="x",
            category="x", attributes={}, embedding=None, created_at=now, updated_at=now,
        )
        with pytest.raises(KeyError):
            s0.update("nope", prod)


# ---------------------------------------------------------------------------
# RetailerSKUStore
# ---------------------------------------------------------------------------


class TestRetailerSKUStore:
    def test_empty_load_missing_file(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        store = RetailerSKUStore.load(p)
        assert store.all() == []

    def test_add_returns_new_store(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        s0 = RetailerSKUStore.load(p)
        sku = _retailer_sku()
        s1 = s0.add(sku)
        assert s0.all() == []
        assert len(s1.all()) == 1

    def test_parquet_roundtrip(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        sku = _retailer_sku()
        s1 = RetailerSKUStore.load(p).add(sku)
        s1.save()
        s2 = RetailerSKUStore.load(p)
        assert s2.all() == [sku]

    def test_retailer_meta_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        sku = _retailer_sku()
        s1 = RetailerSKUStore.load(p).add(sku)
        s1.save()
        loaded = RetailerSKUStore.load(p)
        assert loaded.all()[0].retailer_meta == {"department": "dairy"}

    def test_get_by_id(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        s1 = RetailerSKUStore.load(p).add(_retailer_sku())
        assert s1.get("sku-1") is not None
        assert s1.get("nope") is None

    def test_update_changes_row_content(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        sku = _retailer_sku()
        s1 = RetailerSKUStore.load(p).add(sku)
        updated = RetailerSKU(
            id="sku-1", canonical_product_id="prod-1", retailer="kroger",
            retailer_sku="SKU1-NEW", url="https://kroger.com/p/new",
            title_raw="Kroger Milk Updated", size_raw="2 gal",
            last_seen_at=datetime(2025, 6, 1, tzinfo=UTC),
            match_method="manual", match_confidence=0.9, retailer_meta={},
        )
        s2 = s1.update("sku-1", updated)
        assert s2.get("sku-1") == updated

    def test_update_returns_new_instance(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        sku = _retailer_sku()
        s1 = RetailerSKUStore.load(p).add(sku)
        updated = RetailerSKU(
            id="sku-1", canonical_product_id="prod-1", retailer="kroger",
            retailer_sku="SKU1-NEW", url="https://kroger.com/p/new",
            title_raw="Kroger Milk Updated", size_raw="2 gal",
            last_seen_at=datetime(2025, 6, 1, tzinfo=UTC),
            match_method="manual", match_confidence=0.9, retailer_meta={},
        )
        s2 = s1.update("sku-1", updated)
        assert s2 is not s1

    def test_update_original_unchanged(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        sku = _retailer_sku()
        s1 = RetailerSKUStore.load(p).add(sku)
        updated = RetailerSKU(
            id="sku-1", canonical_product_id="prod-1", retailer="kroger",
            retailer_sku="SKU1-NEW", url="https://kroger.com/p/new",
            title_raw="Kroger Milk Updated", size_raw="2 gal",
            last_seen_at=datetime(2025, 6, 1, tzinfo=UTC),
            match_method="manual", match_confidence=0.9, retailer_meta={},
        )
        s1.update("sku-1", updated)
        assert s1.get("sku-1") == sku

    def test_update_missing_id_raises_key_error(self, tmp_path: Path) -> None:
        p = tmp_path / "retailer_skus.parquet"
        s0 = RetailerSKUStore.load(p)
        with pytest.raises(KeyError):
            s0.update("nonexistent", _retailer_sku())


# ---------------------------------------------------------------------------
# PriceObservationStore
# ---------------------------------------------------------------------------


class TestPriceObservationStore:
    def test_empty_load_missing_file(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        store = PriceObservationStore.load(p)
        assert store.all() == []

    def test_add_returns_new_store(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        s0 = PriceObservationStore.load(p)
        obs = _price_observation()
        s1 = s0.add(obs)
        assert s0.all() == []
        assert len(s1.all()) == 1

    def test_parquet_roundtrip(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        obs = _price_observation()
        s1 = PriceObservationStore.load(p).add(obs)
        s1.save()
        s2 = PriceObservationStore.load(p)
        assert s2.all() == [obs]

    def test_append_multiple(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        store = PriceObservationStore.load(p)
        for i in range(5):
            store = store.add(_price_observation(str(i)))
        store.save()
        loaded = PriceObservationStore.load(p)
        assert len(loaded.all()) == 5

    def test_promo_fields_preserved(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        obs = PriceObservation(
            id="obs-promo",
            retailer="kroger",
            store_location_id="loc-1",
            retailer_sku_id="sku-1",
            canonical_product_id="prod-1",
            price_cents=599,
            unit_price_cents=300,
            was_on_promo=True,
            promo_text="2 for $10",
            promo_price_cents=500,
            observed_at=datetime(2025, 6, 1, tzinfo=UTC),
            source_tier="api",
            raw_response_hash="hashpromo",
        )
        s1 = PriceObservationStore.load(p).add(obs)
        s1.save()
        loaded = PriceObservationStore.load(p)
        restored = loaded.all()[0]
        assert restored.was_on_promo is True
        assert restored.promo_text == "2 for $10"
        assert restored.promo_price_cents == 500

    def test_get_by_id(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        s1 = PriceObservationStore.load(p).add(_price_observation())
        assert s1.get("obs-1") is not None
        assert s1.get("nope") is None

    def test_update_changes_row_content(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        obs = _price_observation()
        s1 = PriceObservationStore.load(p).add(obs)
        updated = PriceObservation(
            id="obs-1", retailer="kroger", store_location_id="loc-1",
            retailer_sku_id="sku-1", canonical_product_id="prod-1",
            price_cents=599, unit_price_cents=None, was_on_promo=False,
            observed_at=datetime(2025, 6, 1, tzinfo=UTC),
            source_tier="api", raw_response_hash="hash_updated",
        )
        s2 = s1.update("obs-1", updated)
        assert s2.get("obs-1") == updated

    def test_update_returns_new_instance(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        obs = _price_observation()
        s1 = PriceObservationStore.load(p).add(obs)
        updated = PriceObservation(
            id="obs-1", retailer="kroger", store_location_id="loc-1",
            retailer_sku_id="sku-1", canonical_product_id="prod-1",
            price_cents=599, unit_price_cents=None, was_on_promo=False,
            observed_at=datetime(2025, 6, 1, tzinfo=UTC),
            source_tier="api", raw_response_hash="hash_updated",
        )
        s2 = s1.update("obs-1", updated)
        assert s2 is not s1

    def test_update_original_unchanged(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        obs = _price_observation()
        s1 = PriceObservationStore.load(p).add(obs)
        updated = PriceObservation(
            id="obs-1", retailer="kroger", store_location_id="loc-1",
            retailer_sku_id="sku-1", canonical_product_id="prod-1",
            price_cents=599, unit_price_cents=None, was_on_promo=False,
            observed_at=datetime(2025, 6, 1, tzinfo=UTC),
            source_tier="api", raw_response_hash="hash_updated",
        )
        s1.update("obs-1", updated)
        assert s1.get("obs-1") == obs

    def test_update_missing_id_raises_key_error(self, tmp_path: Path) -> None:
        p = tmp_path / "price_observations.parquet"
        s0 = PriceObservationStore.load(p)
        with pytest.raises(KeyError):
            s0.update("nonexistent", _price_observation())
