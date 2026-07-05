"""Tests for pricing API dependency providers."""

from __future__ import annotations

from allaroundfood.config import REPO_ROOT
from allaroundfood.pricing.api.deps import _pricing_data_dir


class TestPricingDataDir:
    def test_defaults_to_repo_data_pricing_dir(self) -> None:
        """_pricing_data_dir() must default to repo data/pricing, independent of cwd."""
        expected = REPO_ROOT / "data" / "pricing"
        assert _pricing_data_dir() == expected
