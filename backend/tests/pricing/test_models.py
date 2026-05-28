"""Tests for pricing domain Pydantic models."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from allaroundfood.pricing.models import (
    CanonicalProduct,
    PriceObservation,
    RetailerSKU,
    StoreLocation,
)

# ---------------------------------------------------------------------------
# StoreLocation
# ---------------------------------------------------------------------------


class TestStoreLocation:
    """Tests for StoreLocation model."""

    def _make(self, **overrides: object) -> StoreLocation:
        defaults: dict[str, object] = {
            "id": "loc-1",
            "retailer": "kroger",
            "store_id": "K001",
            "name": "Kroger Main",
            "address": "123 Main St",
            "zip": "84065",
            "lat": 40.5246,
            "lon": -111.9369,
            "fulfillment_zone": None,
        }
        defaults.update(overrides)
        return StoreLocation(**defaults)  # type: ignore[arg-type]

    def test_valid_creation(self) -> None:
        loc = self._make()
        assert loc.id == "loc-1"
        assert loc.retailer == "kroger"
        assert loc.metadata == {}

    def test_invalid_retailer_raises(self) -> None:
        with pytest.raises(ValidationError):
            self._make(retailer="unknown_chain")

    def test_immutable_raises_on_mutation(self) -> None:
        loc = self._make()
        with pytest.raises(ValidationError):
            loc.name = "Changed"  # type: ignore[misc]

    def test_model_dump_json_roundtrip(self) -> None:
        loc = self._make(metadata={"timezone": "America/Denver"})
        raw = loc.model_dump_json()
        restored = StoreLocation.model_validate_json(raw)
        assert restored == loc

    def test_all_retailers_accepted(self) -> None:
        for retailer in ("kroger", "walmart", "costco", "wholefoods", "instacart", "ubereats"):
            loc = self._make(retailer=retailer)
            assert loc.retailer == retailer


# ---------------------------------------------------------------------------
# CanonicalProduct
# ---------------------------------------------------------------------------


class TestCanonicalProduct:
    """Tests for CanonicalProduct model."""

    def _make(self, **overrides: object) -> CanonicalProduct:
        now = datetime.now(UTC)
        defaults: dict[str, object] = {
            "id": "prod-1",
            "gtin": "00012345678905",
            "brand": "BrandX",
            "name": "Whole Milk 1gal",
            "size_value": 1.0,
            "size_unit": "gal",
            "category": "dairy",
            "attributes": {},
            "embedding": None,
            "created_at": now,
            "updated_at": now,
        }
        defaults.update(overrides)
        return CanonicalProduct(**defaults)  # type: ignore[arg-type]

    def test_valid_creation(self) -> None:
        prod = self._make()
        assert prod.name == "Whole Milk 1gal"

    def test_optional_fields_none(self) -> None:
        prod = self._make(gtin=None, brand=None, size_value=None, size_unit=None, category=None)
        assert prod.gtin is None
        assert prod.brand is None

    def test_embedding_384_elements(self) -> None:
        vec = [0.1] * 384
        prod = self._make(embedding=vec)
        assert prod.embedding is not None
        assert len(prod.embedding) == 384

    def test_immutable(self) -> None:
        prod = self._make()
        with pytest.raises(ValidationError):
            prod.name = "Changed"  # type: ignore[misc]

    def test_model_dump_json_roundtrip(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)
        prod = self._make(
            embedding=[0.5] * 384,
            created_at=now,
            updated_at=now,
        )
        raw = prod.model_dump_json()
        restored = CanonicalProduct.model_validate_json(raw)
        assert restored == prod


# ---------------------------------------------------------------------------
# RetailerSKU
# ---------------------------------------------------------------------------


class TestRetailerSKU:
    """Tests for RetailerSKU model."""

    def _make(self, **overrides: object) -> RetailerSKU:
        defaults: dict[str, object] = {
            "id": "sku-1",
            "canonical_product_id": "prod-1",
            "retailer": "kroger",
            "retailer_sku": "0001111041700",
            "url": "https://www.kroger.com/p/0001111041700",
            "title_raw": "Kroger Whole Milk 1 gal",
            "size_raw": "1 gal",
            "last_seen_at": datetime.now(UTC),
            "match_method": "upc",
            "match_confidence": 1.0,
        }
        defaults.update(overrides)
        return RetailerSKU(**defaults)  # type: ignore[arg-type]

    def test_valid_creation(self) -> None:
        sku = self._make()
        assert sku.match_method == "upc"

    def test_invalid_match_method_raises(self) -> None:
        with pytest.raises(ValidationError):
            self._make(match_method="guesswork")

    def test_match_methods_valid(self) -> None:
        for method in ("upc", "fuzzy", "embedding", "manual"):
            sku = self._make(match_method=method)
            assert sku.match_method == method

    def test_immutable(self) -> None:
        sku = self._make()
        with pytest.raises(ValidationError):
            sku.retailer_sku = "9999"  # type: ignore[misc]

    def test_model_dump_json_roundtrip(self) -> None:
        sku = self._make(last_seen_at=datetime(2025, 6, 1, tzinfo=UTC))
        raw = sku.model_dump_json()
        restored = RetailerSKU.model_validate_json(raw)
        assert restored == sku


# ---------------------------------------------------------------------------
# PriceObservation
# ---------------------------------------------------------------------------


class TestPriceObservation:
    """Tests for PriceObservation model."""

    def _make(self, **overrides: object) -> PriceObservation:
        defaults: dict[str, object] = {
            "id": "obs-1",
            "retailer": "kroger",
            "store_location_id": "loc-1",
            "retailer_sku_id": "sku-1",
            "canonical_product_id": "prod-1",
            "price_cents": 499,
            "unit_price_cents": None,
            "was_on_promo": False,
            "promo_text": None,
            "promo_price_cents": None,
            "currency": "USD",
            "observed_at": datetime.now(UTC),
            "source_tier": "api",
            "raw_response_hash": "abc123",
        }
        defaults.update(overrides)
        return PriceObservation(**defaults)  # type: ignore[arg-type]

    def test_valid_creation(self) -> None:
        obs = self._make()
        assert obs.price_cents == 499
        assert obs.currency == "USD"
        assert not obs.was_on_promo

    def test_promo_fields(self) -> None:
        obs = self._make(
            was_on_promo=True,
            promo_text="Buy 2 save $1",
            promo_price_cents=399,
        )
        assert obs.was_on_promo
        assert obs.promo_price_cents == 399

    def test_invalid_source_tier_raises(self) -> None:
        with pytest.raises(ValidationError):
            self._make(source_tier="fax")

    def test_all_source_tiers_valid(self) -> None:
        for tier in ("api", "json", "browser", "ocr", "manual"):
            obs = self._make(source_tier=tier)
            assert obs.source_tier == tier

    def test_immutable(self) -> None:
        obs = self._make()
        with pytest.raises(ValidationError):
            obs.price_cents = 100  # type: ignore[misc]

    def test_model_dump_json_roundtrip(self) -> None:
        obs = self._make(observed_at=datetime(2025, 6, 1, tzinfo=UTC))
        raw = obs.model_dump_json()
        restored = PriceObservation.model_validate_json(raw)
        assert restored == obs

    def test_json_is_valid_json(self) -> None:
        obs = self._make()
        raw = obs.model_dump_json()
        parsed = json.loads(raw)
        assert parsed["price_cents"] == 499
