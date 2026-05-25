"""Unit tests for retailer_ranking analytics."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import polars as pl
import pytest

from allaroundfood.pricing.analytics.retailer_ranking import (
    BasketRanking,
    RetailerRanking,
    rank_basket,
    rank_retailers_for_product,
)
from allaroundfood.pricing.models import StoreLocation
from allaroundfood.pricing.store.store_location_store import StoreLocationStore

UTC = timezone.utc
T0 = datetime(2024, 1, 1, tzinfo=UTC)
T1 = datetime(2024, 1, 2, tzinfo=UTC)
T2 = datetime(2024, 1, 3, tzinfo=UTC)


def _make_observations(rows: list[dict]) -> pl.DataFrame:  # type: ignore[type-arg]
    return pl.DataFrame(
        {
            "id": pl.Series([r.get("id", "obs") for r in rows], dtype=pl.String),
            "canonical_product_id": pl.Series(
                [r["canonical_product_id"] for r in rows], dtype=pl.String
            ),
            "retailer": pl.Series([r["retailer"] for r in rows], dtype=pl.String),
            "store_location_id": pl.Series(
                [r["store_location_id"] for r in rows], dtype=pl.String
            ),
            "price_cents": pl.Series(
                [r["price_cents"] for r in rows], dtype=pl.Int64
            ),
            "observed_at": pl.Series(
                [r["observed_at"] for r in rows], dtype=pl.Datetime("us", "UTC")
            ),
            "was_on_promo": pl.Series(
                [r.get("was_on_promo", False) for r in rows], dtype=pl.Boolean
            ),
        }
    )


def _make_location_store(locations: list[StoreLocation]) -> StoreLocationStore:
    store = StoreLocationStore(Path("/tmp/fake_locations.parquet"))
    for loc in locations:
        store = store.add(loc)
    return store


def _loc(location_id: str, retailer: str, zip_code: str) -> StoreLocation:
    return StoreLocation(
        id=location_id,
        retailer=retailer,  # type: ignore[arg-type]
        store_id=location_id,
        name=f"Store {location_id}",
        address="123 Main St",
        zip=zip_code,
        lat=0.0,
        lon=0.0,
        fulfillment_zone=None,
    )


# ---------------------------------------------------------------------------
# rank_retailers_for_product
# ---------------------------------------------------------------------------


class TestRankRetailersForProduct:
    def test_ordered_by_price_ascending(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": T0,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 250,
                    "observed_at": T0,
                },
                {
                    "id": "o3",
                    "canonical_product_id": "p1",
                    "retailer": "costco",
                    "store_location_id": "s3",
                    "price_cents": 400,
                    "observed_at": T0,
                },
            ]
        )
        results = rank_retailers_for_product("p1", obs)
        assert [r.rank for r in results] == [1, 2, 3]
        assert [r.retailer for r in results] == ["walmart", "kroger", "costco"]

    def test_tie_broken_by_observed_at_desc(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 250,
                    "observed_at": T0,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 250,
                    "observed_at": T2,  # more recent → rank 1 on tie
                },
            ]
        )
        results = rank_retailers_for_product("p1", obs)
        assert results[0].retailer == "walmart"
        assert results[0].rank == 1

    def test_latest_only_per_group(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": T0,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 100,  # older — should NOT win
                    "observed_at": T1,
                },
            ]
        )
        results = rank_retailers_for_product("p1", obs)
        assert len(results) == 1
        assert results[0].price_cents == 100  # T1 > T0 so latest is 100

    def test_zip_filter_narrows_results(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s_90210",
                    "price_cents": 300,
                    "observed_at": T0,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s_10001",
                    "price_cents": 200,
                    "observed_at": T0,
                },
            ]
        )
        loc_store = _make_location_store(
            [
                _loc("s_90210", "kroger", "90210"),
                _loc("s_10001", "walmart", "10001"),
            ]
        )
        results = rank_retailers_for_product(
            "p1", obs, store_zip="90210", store_location_store=loc_store
        )
        assert len(results) == 1
        assert results[0].retailer == "kroger"

    def test_zip_no_match_returns_empty(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": T0,
                }
            ]
        )
        loc_store = _make_location_store([_loc("s1", "kroger", "90210")])
        results = rank_retailers_for_product(
            "p1", obs, store_zip="99999", store_location_store=loc_store
        )
        assert results == []

    def test_no_observations_returns_empty(self) -> None:
        obs = _make_observations([])
        assert rank_retailers_for_product("p1", obs) == []

    def test_returns_pydantic_models(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": T0,
                }
            ]
        )
        results = rank_retailers_for_product("p1", obs)
        assert all(isinstance(r, RetailerRanking) for r in results)


# ---------------------------------------------------------------------------
# rank_basket
# ---------------------------------------------------------------------------


class TestRankBasket:
    def test_basket_totals(self) -> None:
        obs = _make_observations(
            [
                # kroger: p1=200, p2=300 → total=500
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 200,
                    "observed_at": T0,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p2",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": T0,
                },
                # walmart: p1=180, p2=350 → total=530
                {
                    "id": "o3",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 180,
                    "observed_at": T0,
                },
                {
                    "id": "o4",
                    "canonical_product_id": "p2",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 350,
                    "observed_at": T0,
                },
            ]
        )
        results = rank_basket(["p1", "p2"], obs)
        assert results[0].retailer == "kroger"
        assert results[0].total_cents == 500
        assert results[0].items_covered == 2
        assert results[0].items_missing == 0
        assert results[1].retailer == "walmart"
        assert results[1].total_cents == 530

    def test_missing_items_counted(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 200,
                    "observed_at": T0,
                },
                # p2 only at walmart, not kroger
                {
                    "id": "o2",
                    "canonical_product_id": "p2",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 300,
                    "observed_at": T0,
                },
            ]
        )
        results = rank_basket(["p1", "p2"], obs)
        kroger_result = next(r for r in results if r.retailer == "kroger")
        walmart_result = next(r for r in results if r.retailer == "walmart")
        assert kroger_result.items_covered == 1
        assert kroger_result.items_missing == 1
        assert walmart_result.items_covered == 1
        assert walmart_result.items_missing == 1

    def test_empty_ids_returns_empty(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 200,
                    "observed_at": T0,
                }
            ]
        )
        assert rank_basket([], obs) == []

    def test_returns_pydantic_models(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 200,
                    "observed_at": T0,
                }
            ]
        )
        results = rank_basket(["p1"], obs)
        assert all(isinstance(r, BasketRanking) for r in results)
