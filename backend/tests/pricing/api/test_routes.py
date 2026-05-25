"""Integration tests for pricing FastAPI routes using TestClient.

Dependency overrides supply in-memory stores with a seeded dataset of:
  - 5 canonical products (milk, bread, eggs, cheese, butter)
  - ~20 observations across 3 retailers (kroger, walmart, costco)
  - 2 store locations per retailer, 2 ZIPs (90210, 10001)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from allaroundfood.api import app
from allaroundfood.pricing.api.deps import (
    get_canonical_store,
    get_location_store,
    get_observation_store,
    get_sku_store,
)
from allaroundfood.pricing.models import (
    CanonicalProduct,
    PriceObservation,
    StoreLocation,
)
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore
from allaroundfood.pricing.store.store_location_store import StoreLocationStore

UTC = timezone.utc
NOW = datetime(2024, 6, 15, tzinfo=UTC)

# ---------------------------------------------------------------------------
# Seed data builders
# ---------------------------------------------------------------------------


def _make_canonical_store() -> CanonicalProductStore:
    store = CanonicalProductStore(Path("/tmp/test_canonicals.parquet"))
    products = [
        CanonicalProduct(
            id="p_milk",
            gtin=None,
            brand="Organic Valley",
            name="Whole Milk",
            size_value=64.0,
            size_unit="fl_oz",
            category="dairy",
            attributes={},
            embedding=None,
            created_at=NOW,
            updated_at=NOW,
        ),
        CanonicalProduct(
            id="p_bread",
            gtin=None,
            brand="Dave's Killer Bread",
            name="Whole Grain Bread",
            size_value=27.0,
            size_unit="oz",
            category="bakery",
            attributes={},
            embedding=None,
            created_at=NOW,
            updated_at=NOW,
        ),
        CanonicalProduct(
            id="p_eggs",
            gtin=None,
            brand="Happy Egg",
            name="Large White Eggs",
            size_value=12.0,
            size_unit="ct",
            category="dairy",
            attributes={},
            embedding=None,
            created_at=NOW,
            updated_at=NOW,
        ),
        CanonicalProduct(
            id="p_cheese",
            gtin=None,
            brand="Tillamook",
            name="Sharp Cheddar Cheese",
            size_value=16.0,
            size_unit="oz",
            category="dairy",
            attributes={},
            embedding=None,
            created_at=NOW,
            updated_at=NOW,
        ),
        CanonicalProduct(
            id="p_butter",
            gtin=None,
            brand="Kerrygold",
            name="Unsalted Butter",
            size_value=8.0,
            size_unit="oz",
            category="dairy",
            attributes={},
            embedding=None,
            created_at=NOW,
            updated_at=NOW,
        ),
    ]
    for p in products:
        store = store.add(p)
    return store


def _make_location_store() -> StoreLocationStore:
    store = StoreLocationStore(Path("/tmp/test_locations.parquet"))
    locations = [
        StoreLocation(
            id="loc_kroger_90210",
            retailer="kroger",
            store_id="k1",
            name="Kroger 90210",
            address="1 Beverly Hills",
            zip="90210",
            lat=34.0,
            lon=-118.0,
            fulfillment_zone=None,
        ),
        StoreLocation(
            id="loc_kroger_10001",
            retailer="kroger",
            store_id="k2",
            name="Kroger 10001",
            address="1 Manhattan",
            zip="10001",
            lat=40.7,
            lon=-74.0,
            fulfillment_zone=None,
        ),
        StoreLocation(
            id="loc_walmart_90210",
            retailer="walmart",
            store_id="w1",
            name="Walmart 90210",
            address="2 Beverly Hills",
            zip="90210",
            lat=34.1,
            lon=-118.1,
            fulfillment_zone=None,
        ),
        StoreLocation(
            id="loc_walmart_10001",
            retailer="walmart",
            store_id="w2",
            name="Walmart 10001",
            address="2 Manhattan",
            zip="10001",
            lat=40.8,
            lon=-74.1,
            fulfillment_zone=None,
        ),
        StoreLocation(
            id="loc_costco_90210",
            retailer="costco",
            store_id="c1",
            name="Costco 90210",
            address="3 Beverly Hills",
            zip="90210",
            lat=34.2,
            lon=-118.2,
            fulfillment_zone=None,
        ),
    ]
    for loc in locations:
        store = store.add(loc)
    return store


def _obs(
    obs_id: str,
    canonical_product_id: str,
    retailer: str,
    store_location_id: str,
    price_cents: int,
    observed_at: datetime,
    was_on_promo: bool = False,
) -> PriceObservation:
    return PriceObservation(
        id=obs_id,
        retailer=retailer,
        store_location_id=store_location_id,
        retailer_sku_id="sku1",
        canonical_product_id=canonical_product_id,
        price_cents=price_cents,
        unit_price_cents=None,
        was_on_promo=was_on_promo,
        currency="USD",
        observed_at=observed_at,
        source_tier="manual",
        raw_response_hash="abc",
    )


def _make_observation_store() -> PriceObservationStore:
    store = PriceObservationStore(Path("/tmp/test_observations.parquet"))

    observations = [
        # Milk — 3 retailers
        _obs("o1", "p_milk", "kroger", "loc_kroger_90210", 499, NOW - timedelta(days=5)),
        _obs("o2", "p_milk", "walmart", "loc_walmart_90210", 449, NOW - timedelta(days=3)),
        _obs("o3", "p_milk", "costco", "loc_costco_90210", 599, NOW - timedelta(days=4)),
        _obs("o4", "p_milk", "kroger", "loc_kroger_10001", 509, NOW - timedelta(days=2)),
        _obs("o5", "p_milk", "walmart", "loc_walmart_10001", 459, NOW - timedelta(days=1)),
        # Bread — 2 retailers
        _obs("o6", "p_bread", "kroger", "loc_kroger_90210", 599, NOW - timedelta(days=10)),
        _obs("o7", "p_bread", "walmart", "loc_walmart_90210", 549, NOW - timedelta(days=8)),
        # Eggs — 3 retailers
        _obs("o8", "p_eggs", "kroger", "loc_kroger_90210", 399, NOW - timedelta(days=6)),
        _obs("o9", "p_eggs", "walmart", "loc_walmart_90210", 349, NOW - timedelta(days=4)),
        _obs("o10", "p_eggs", "costco", "loc_costco_90210", 299, NOW - timedelta(days=2)),
        # Cheese — 2 retailers
        _obs("o11", "p_cheese", "kroger", "loc_kroger_90210", 799, NOW - timedelta(days=7)),
        _obs("o12", "p_cheese", "walmart", "loc_walmart_90210", 749, NOW - timedelta(days=5)),
        # Butter — 1 retailer
        _obs("o13", "p_butter", "kroger", "loc_kroger_90210", 599, NOW - timedelta(days=3)),
        # Promo seed: milk at kroger has a historical baseline + a drop in recent window
        # Baseline: days 60-31 (before detection window)
        _obs("pb1", "p_milk", "kroger", "loc_kroger_90210", 499, NOW - timedelta(days=60)),
        _obs("pb2", "p_milk", "kroger", "loc_kroger_90210", 505, NOW - timedelta(days=55)),
        _obs("pb3", "p_milk", "kroger", "loc_kroger_90210", 495, NOW - timedelta(days=50)),
        _obs("pb4", "p_milk", "kroger", "loc_kroger_90210", 501, NOW - timedelta(days=45)),
        _obs("pb5", "p_milk", "kroger", "loc_kroger_90210", 498, NOW - timedelta(days=40)),
        _obs("pb6", "p_milk", "kroger", "loc_kroger_90210", 503, NOW - timedelta(days=35)),
        # Promo drop in detection window
        _obs(
            "pdrop",
            "p_milk",
            "kroger",
            "loc_kroger_90210",
            199,  # massive drop
            NOW - timedelta(days=10),
            was_on_promo=True,
        ),
    ]
    for obs in observations:
        store = store.add(obs)
    return store


def _make_sku_store() -> RetailerSKUStore:
    return RetailerSKUStore(Path("/tmp/test_skus.parquet"))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client() -> TestClient:
    """TestClient with dependency overrides for all 4 pricing stores."""
    canonical_store = _make_canonical_store()
    obs_store = _make_observation_store()
    location_store = _make_location_store()
    sku_store = _make_sku_store()

    app.dependency_overrides[get_canonical_store] = lambda: canonical_store
    app.dependency_overrides[get_observation_store] = lambda: obs_store
    app.dependency_overrides[get_location_store] = lambda: location_store
    app.dependency_overrides[get_sku_store] = lambda: sku_store

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /pricing/search tests
# ---------------------------------------------------------------------------


class TestSearchEndpoint:
    def test_search_milk_returns_results(self, client: TestClient) -> None:
        resp = client.get("/pricing/search?q=milk")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert len(data) >= 1
        names = [d["name"] for d in data]
        assert any("Milk" in n or "milk" in n.lower() for n in names)

    def test_search_by_brand(self, client: TestClient) -> None:
        resp = client.get("/pricing/search?q=Dave")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert len(body["data"]) >= 1

    def test_search_with_zip_filter(self, client: TestClient) -> None:
        # Both milk and eggs exist at 90210 (kroger, walmart, costco)
        resp = client.get("/pricing/search?q=milk&zip=90210")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        # Results should include milk (available at 90210)
        assert len(body["data"]) >= 1

    def test_search_bad_zip_returns_400(self, client: TestClient) -> None:
        resp = client.get("/pricing/search?q=milk&zip=BADZIP")
        assert resp.status_code == 400

    def test_search_no_results(self, client: TestClient) -> None:
        resp = client.get("/pricing/search?q=xyznotaproduct")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_search_missing_q_returns_422(self, client: TestClient) -> None:
        resp = client.get("/pricing/search")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /pricing/compare tests
# ---------------------------------------------------------------------------


class TestCompareEndpoint:
    def test_compare_milk_returns_ordered_ranking(self, client: TestClient) -> None:
        resp = client.get("/pricing/compare?canonical_id=p_milk")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert len(data) >= 2
        # Ranks should be sequential starting at 1
        ranks = [d["rank"] for d in data]
        assert ranks[0] == 1
        # Prices should be ascending
        prices = [d["price_cents"] for d in data]
        assert prices == sorted(prices)

    def test_compare_with_zip_filter(self, client: TestClient) -> None:
        resp = client.get("/pricing/compare?canonical_id=p_milk&zip=90210")
        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        # All returned store_location_ids should be in 90210
        location_ids = {d["store_location_id"] for d in data}
        valid_90210_locations = {"loc_kroger_90210", "loc_walmart_90210", "loc_costco_90210"}
        assert location_ids.issubset(valid_90210_locations)

    def test_compare_bad_zip_returns_400(self, client: TestClient) -> None:
        resp = client.get("/pricing/compare?canonical_id=p_milk&zip=1234")
        assert resp.status_code == 400

    def test_compare_missing_canonical_id_returns_422(self, client: TestClient) -> None:
        resp = client.get("/pricing/compare")
        assert resp.status_code == 422

    def test_compare_unknown_product_returns_empty(self, client: TestClient) -> None:
        resp = client.get("/pricing/compare?canonical_id=unknown_product")
        assert resp.status_code == 200
        assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# GET /pricing/history tests
# ---------------------------------------------------------------------------


class TestHistoryEndpoint:
    def test_history_returns_sorted_points(self, client: TestClient) -> None:
        resp = client.get("/pricing/history?canonical_id=p_milk")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert len(data) >= 1
        # Check chronological order
        timestamps = [d["observed_at"] for d in data]
        assert timestamps == sorted(timestamps)

    def test_history_window_filter(self, client: TestClient) -> None:
        # Use a very short window (3 days) to get only very recent observations
        resp = client.get("/pricing/history?canonical_id=p_milk&days=3")
        assert resp.status_code == 200
        data = resp.json()["data"]
        # With 3-day window, should include fewer observations than full history
        resp_full = client.get("/pricing/history?canonical_id=p_milk&days=365")
        data_full = resp_full.json()["data"]
        assert len(data) <= len(data_full)

    def test_history_zip_filter(self, client: TestClient) -> None:
        resp = client.get("/pricing/history?canonical_id=p_milk&zip=90210")
        assert resp.status_code == 200
        data = resp.json()["data"]
        location_ids = {d["store_location_id"] for d in data}
        valid = {"loc_kroger_90210", "loc_walmart_90210", "loc_costco_90210"}
        assert location_ids.issubset(valid)

    def test_history_bad_zip_returns_400(self, client: TestClient) -> None:
        resp = client.get("/pricing/history?canonical_id=p_milk&zip=ABCDE")
        assert resp.status_code == 400

    def test_history_days_out_of_range_returns_422(self, client: TestClient) -> None:
        resp = client.get("/pricing/history?canonical_id=p_milk&days=0")
        assert resp.status_code == 422

    def test_history_output_fields(self, client: TestClient) -> None:
        resp = client.get("/pricing/history?canonical_id=p_milk")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) >= 1
        point = data[0]
        assert set(point.keys()) >= {
            "observed_at",
            "retailer",
            "store_location_id",
            "price_cents",
            "was_on_promo",
        }


# ---------------------------------------------------------------------------
# GET /pricing/promotions tests
# ---------------------------------------------------------------------------


class TestPromotionsEndpoint:
    def test_promotions_returns_flagged_drops(self, client: TestClient) -> None:
        # Use 30-day detection window — the seeded drop at day-10 should be flagged
        resp = client.get("/pricing/promotions?days=30")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert len(data) >= 1
        # The milk promo should be detected
        milk_flags = [d for d in data if d["canonical_product_id"] == "p_milk"]
        assert len(milk_flags) >= 1
        assert milk_flags[0]["was_marked_promo"] is True

    def test_promotions_days_validates(self, client: TestClient) -> None:
        resp = client.get("/pricing/promotions?days=400")
        assert resp.status_code == 422

    def test_promotions_response_fields(self, client: TestClient) -> None:
        resp = client.get("/pricing/promotions?days=30")
        assert resp.status_code == 200
        data = resp.json()["data"]
        if data:
            flag = data[0]
            assert set(flag.keys()) >= {
                "canonical_product_id",
                "retailer",
                "store_location_id",
                "baseline_price_cents",
                "drop_price_cents",
                "zscore",
                "observed_at",
                "was_marked_promo",
            }


# ---------------------------------------------------------------------------
# POST /pricing/basket tests
# ---------------------------------------------------------------------------


class TestBasketEndpoint:
    def test_basket_returns_per_retailer_totals(self, client: TestClient) -> None:
        resp = client.post(
            "/pricing/basket",
            json={"canonical_product_ids": ["p_milk", "p_eggs"]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert len(data) >= 1
        # All results should have required fields
        for item in data:
            assert "retailer" in item
            assert "total_cents" in item
            assert "items_covered" in item
            assert "items_missing" in item
        # Sorted by total_cents
        totals = [d["total_cents"] for d in data]
        assert totals == sorted(totals)

    def test_basket_with_zip_filter(self, client: TestClient) -> None:
        resp = client.post(
            "/pricing/basket",
            json={"canonical_product_ids": ["p_milk", "p_eggs"], "zip": "90210"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        # Results should only include retailers with 90210 locations
        data = body["data"]
        for item in data:
            assert item["retailer"] in {"kroger", "walmart", "costco"}

    def test_basket_counts_missing_items(self, client: TestClient) -> None:
        # Butter is only at kroger; eggs at kroger+walmart+costco
        resp = client.post(
            "/pricing/basket",
            json={"canonical_product_ids": ["p_butter", "p_eggs"]},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        # walmart should have eggs but not butter (items_missing=1)
        walmart = next((d for d in data if d["retailer"] == "walmart"), None)
        if walmart is not None:
            assert walmart["items_missing"] >= 1

    def test_basket_bad_zip_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/pricing/basket",
            json={"canonical_product_ids": ["p_milk"], "zip": "BADZIP"},
        )
        assert resp.status_code == 422

    def test_basket_empty_ids_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/pricing/basket",
            json={"canonical_product_ids": []},
        )
        assert resp.status_code == 422

    def test_basket_missing_body_returns_422(self, client: TestClient) -> None:
        resp = client.post("/pricing/basket")
        assert resp.status_code == 422
