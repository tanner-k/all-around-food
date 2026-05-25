"""Unit tests for price history and promotion detection analytics."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import polars as pl
import pytest

from allaroundfood.pricing.analytics.history import (
    PromoFlag,
    detect_promotions,
    price_history,
)

UTC = timezone.utc

BASE = datetime(2024, 6, 1, tzinfo=UTC)


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


# ---------------------------------------------------------------------------
# price_history tests
# ---------------------------------------------------------------------------


class TestPriceHistory:
    def test_returns_sorted_by_observed_at(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o3",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE + timedelta(days=2),
                },
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 320,
                    "observed_at": BASE,
                },
            ]
        )
        df = price_history("p1", obs)
        prices = df["price_cents"].to_list()
        assert prices == [320, 300]

    def test_filter_by_retailer(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s2",
                    "price_cents": 250,
                    "observed_at": BASE,
                },
            ]
        )
        df = price_history("p1", obs, retailer="kroger")
        assert df["retailer"].to_list() == ["kroger"]

    def test_filter_by_store_location(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s2",
                    "price_cents": 280,
                    "observed_at": BASE,
                },
            ]
        )
        df = price_history("p1", obs, store_location_id="s1")
        assert len(df) == 1
        assert df["store_location_id"][0] == "s1"

    def test_window_days_filter(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE,
                },
                {
                    "id": "o2",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 280,
                    "observed_at": BASE + timedelta(days=20),
                },
            ]
        )
        # Only keep last 10 days relative to most recent (BASE+20)
        # BASE is 20 days before max → outside 10-day window
        df = price_history("p1", obs, window_days=10)
        assert len(df) == 1
        assert df["price_cents"][0] == 280

    def test_unknown_product_returns_empty(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE,
                }
            ]
        )
        df = price_history("unknown", obs)
        assert df.is_empty()

    def test_output_columns(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "kroger",
                    "store_location_id": "s1",
                    "price_cents": 300,
                    "observed_at": BASE,
                }
            ]
        )
        df = price_history("p1", obs)
        assert set(df.columns) == {
            "observed_at",
            "retailer",
            "store_location_id",
            "price_cents",
            "was_on_promo",
        }


# ---------------------------------------------------------------------------
# detect_promotions tests
# ---------------------------------------------------------------------------


def _make_synthetic_promo_data() -> pl.DataFrame:
    """Create a dataset with a clear promotional drop in the detection window.

    Timeline (max_ts = BASE + 80 days):
      - baseline_cutoff = max_ts - 90d = BASE - 10d  (rows >= this in baseline)
      - detection_cutoff = max_ts - 30d = BASE + 50d (rows >= this in detection)
      - Baseline observations: days 0-49 (before detection window)
      - Detection observation: day 80 (price 100, clearly below baseline)

    Baseline prices vary slightly (295–305) so std > 0 and z-score can be computed.
    """
    rows = []
    # 10 baseline observations with slight variance, in days 0-49
    baseline_prices = [295, 300, 305, 298, 302, 299, 301, 300, 303, 297]
    for i in range(10):
        rows.append(
            {
                "id": f"b{i}",
                "canonical_product_id": "p1",
                "retailer": "kroger",
                "store_location_id": "s1",
                "price_cents": baseline_prices[i],
                "observed_at": BASE + timedelta(days=i * 4),  # days 0,4,...,36
                "was_on_promo": False,
            }
        )
    # One promotional observation in the detection window (day 80)
    rows.append(
        {
            "id": "promo1",
            "canonical_product_id": "p1",
            "retailer": "kroger",
            "store_location_id": "s1",
            "price_cents": 100,
            "observed_at": BASE + timedelta(days=80),
            "was_on_promo": True,
        }
    )
    return _make_observations(rows)


class TestDetectPromotions:
    def test_detects_obvious_drop(self) -> None:
        obs = _make_synthetic_promo_data()
        flags = detect_promotions(
            obs,
            zscore_threshold=-1.5,
            baseline_window_days=90,
            detection_window_days=30,
        )
        assert len(flags) >= 1
        flag = flags[0]
        assert flag.canonical_product_id == "p1"
        assert flag.retailer == "kroger"
        assert flag.drop_price_cents == 100
        assert flag.zscore < -1.5

    def test_was_marked_promo_propagated(self) -> None:
        obs = _make_synthetic_promo_data()
        flags = detect_promotions(obs)
        promo_flags = [f for f in flags if f.drop_price_cents == 100]
        assert len(promo_flags) == 1
        assert promo_flags[0].was_marked_promo is True

    def test_no_flags_when_stable(self) -> None:
        rows = [
            {
                "id": f"o{i}",
                "canonical_product_id": "p1",
                "retailer": "kroger",
                "store_location_id": "s1",
                "price_cents": 300,
                "observed_at": BASE + timedelta(days=i),
                "was_on_promo": False,
            }
            for i in range(100)
        ]
        obs = _make_observations(rows)
        flags = detect_promotions(obs, zscore_threshold=-1.5)
        assert flags == []

    def test_empty_df_returns_empty(self) -> None:
        obs = _make_observations([])
        flags = detect_promotions(obs)
        assert flags == []

    def test_returns_promo_flag_models(self) -> None:
        obs = _make_synthetic_promo_data()
        flags = detect_promotions(obs)
        assert all(isinstance(f, PromoFlag) for f in flags)
