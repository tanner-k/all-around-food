"""Unit tests for price_per_unit analytics."""

from __future__ import annotations

from datetime import UTC, datetime

import polars as pl
import pytest

from allaroundfood.pricing.analytics.price_per_unit import (
    PricePerUnit,
    compute_price_per_unit,
    latest_price_per_unit,
    normalize_size,
)

UTC = UTC


# ---------------------------------------------------------------------------
# normalize_size tests
# ---------------------------------------------------------------------------


class TestNormalizeSize:
    def test_oz_unchanged(self) -> None:
        result = normalize_size(16.0, "oz")
        assert result is not None
        normalized, unit = result
        assert unit == "oz"
        assert normalized == pytest.approx(16.0)

    def test_lb_to_oz(self) -> None:
        result = normalize_size(1.0, "lb")
        assert result is not None
        normalized, unit = result
        assert unit == "oz"
        assert normalized == pytest.approx(16.0)

    def test_g_to_oz(self) -> None:
        result = normalize_size(28.3495, "g")
        assert result is not None
        normalized, unit = result
        assert unit == "oz"
        assert normalized == pytest.approx(1.0, rel=1e-3)

    def test_kg_to_oz(self) -> None:
        result = normalize_size(1.0, "kg")
        assert result is not None
        normalized, unit = result
        assert unit == "oz"
        # 1 kg = 35.274 oz
        assert normalized == pytest.approx(35.274, rel=1e-3)

    def test_fl_oz_unchanged(self) -> None:
        result = normalize_size(12.0, "fl_oz")
        assert result is not None
        normalized, unit = result
        assert unit == "fl_oz"
        assert normalized == pytest.approx(12.0)

    def test_ml_to_fl_oz(self) -> None:
        result = normalize_size(355.0, "ml")
        assert result is not None
        normalized, unit = result
        assert unit == "fl_oz"
        # 355 ml ≈ 12 fl oz
        assert normalized == pytest.approx(12.0, rel=1e-2)

    def test_l_to_fl_oz(self) -> None:
        result = normalize_size(1.0, "l")
        assert result is not None
        normalized, unit = result
        assert unit == "fl_oz"
        assert normalized == pytest.approx(33.814, rel=1e-2)

    def test_ct_unchanged(self) -> None:
        result = normalize_size(12.0, "ct")
        assert result is not None
        normalized, unit = result
        assert unit == "ct"
        assert normalized == pytest.approx(12.0)

    def test_unknown_unit_returns_none(self) -> None:
        assert normalize_size(1.0, "stone") is None
        assert normalize_size(1.0, "furlong") is None
        assert normalize_size(1.0, "") is None

    def test_case_insensitive(self) -> None:
        result = normalize_size(1.0, "LB")
        assert result is not None
        _, unit = result
        assert unit == "oz"

    def test_count_alias(self) -> None:
        for alias in ("count", "ea", "each", "pk", "pack"):
            result = normalize_size(6.0, alias)
            assert result is not None
            normalized, unit = result
            assert unit == "ct"
            assert normalized == pytest.approx(6.0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_observations(rows: list[dict]) -> pl.DataFrame:  # type: ignore[type-arg]
    """Build a minimal observations DataFrame for testing."""
    return pl.DataFrame(
        {
            "id": pl.Series([r.get("id", "obs1") for r in rows], dtype=pl.String),
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


def _make_canonical(rows: list[dict]) -> pl.DataFrame:  # type: ignore[type-arg]
    return pl.DataFrame(
        {
            "id": pl.Series([r["id"] for r in rows], dtype=pl.String),
            "name": pl.Series([r.get("name", "Product") for r in rows], dtype=pl.String),
            "size_value": pl.Series(
                [r.get("size_value") for r in rows], dtype=pl.Float64
            ),
            "size_unit": pl.Series(
                [r.get("size_unit") for r in rows], dtype=pl.String
            ),
        }
    )


T0 = datetime(2024, 1, 1, tzinfo=UTC)
T1 = datetime(2024, 1, 2, tzinfo=UTC)
T2 = datetime(2024, 1, 3, tzinfo=UTC)


# ---------------------------------------------------------------------------
# compute_price_per_unit tests
# ---------------------------------------------------------------------------


class TestComputePricePerUnit:
    def test_basic_oz(self) -> None:
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
        can = _make_canonical([{"id": "p1", "size_value": 16.0, "size_unit": "oz"}])
        result = compute_price_per_unit(obs, can)
        assert len(result) == 1
        row = result.row(0, named=True)
        assert row["normalized_unit"] == "oz"
        assert row["normalized_size"] == pytest.approx(16.0)
        assert row["price_per_unit_cents"] == pytest.approx(300 / 16.0)

    def test_lb_conversion(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "walmart",
                    "store_location_id": "s1",
                    "price_cents": 320,
                    "observed_at": T0,
                }
            ]
        )
        can = _make_canonical([{"id": "p1", "size_value": 2.0, "size_unit": "lb"}])
        result = compute_price_per_unit(obs, can)
        row = result.row(0, named=True)
        assert row["normalized_unit"] == "oz"
        assert row["normalized_size"] == pytest.approx(32.0)

    def test_unknown_unit_excluded(self) -> None:
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
        can = _make_canonical([{"id": "p1", "size_value": 1.0, "size_unit": "stone"}])
        result = compute_price_per_unit(obs, can)
        assert result.is_empty()

    def test_null_size_excluded(self) -> None:
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
        can = _make_canonical([{"id": "p1", "size_value": None, "size_unit": None}])
        result = compute_price_per_unit(obs, can)
        assert result.is_empty()

    def test_ct_conversion(self) -> None:
        obs = _make_observations(
            [
                {
                    "id": "o1",
                    "canonical_product_id": "p1",
                    "retailer": "costco",
                    "store_location_id": "s1",
                    "price_cents": 600,
                    "observed_at": T0,
                }
            ]
        )
        can = _make_canonical([{"id": "p1", "size_value": 12.0, "size_unit": "ct"}])
        result = compute_price_per_unit(obs, can)
        row = result.row(0, named=True)
        assert row["price_per_unit_cents"] == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# latest_price_per_unit tests
# ---------------------------------------------------------------------------


class TestLatestPricePerUnit:
    def test_returns_most_recent_per_group(self) -> None:
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
                    "price_cents": 280,
                    "observed_at": T2,  # more recent
                },
            ]
        )
        can = _make_canonical([{"id": "p1", "size_value": 16.0, "size_unit": "oz"}])
        results = latest_price_per_unit(obs, can)
        assert len(results) == 1
        assert results[0].price_cents == 280

    def test_one_per_group(self) -> None:
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
                    "price_cents": 320,
                    "observed_at": T1,
                },
            ]
        )
        can = _make_canonical([{"id": "p1", "size_value": 16.0, "size_unit": "oz"}])
        results = latest_price_per_unit(obs, can)
        assert len(results) == 2

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
        can = _make_canonical([{"id": "p1", "size_value": 8.0, "size_unit": "fl_oz"}])
        results = latest_price_per_unit(obs, can)
        assert len(results) == 1
        assert isinstance(results[0], PricePerUnit)

    def test_empty_returns_empty_list(self) -> None:
        obs = _make_observations([])
        can = _make_canonical([])
        results = latest_price_per_unit(obs, can)
        assert results == []
