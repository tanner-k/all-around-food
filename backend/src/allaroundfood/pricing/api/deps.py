"""FastAPI dependency providers for the pricing stores.

Default implementations load from Settings.pricing_data_dir.
Tests override these via app.dependency_overrides.
"""

from __future__ import annotations

from pathlib import Path

from allaroundfood.config import settings
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore
from allaroundfood.pricing.store.store_location_store import StoreLocationStore

# ---------------------------------------------------------------------------
# Data directory
# ---------------------------------------------------------------------------


def _pricing_data_dir() -> Path:
    """Return the pricing data directory resolved from Settings.pricing_data_dir.

    ``settings.pricing_data_dir`` defaults to ``Path("data")`` (relative), so
    it resolves against the current working directory — typically the repo root
    when the server is started with ``uv run`` from the backend directory.
    This avoids hardcoding an absolute path that breaks across machines.
    """
    return settings.pricing_data_dir.resolve() / "pricing"


# ---------------------------------------------------------------------------
# Dependency callables
# ---------------------------------------------------------------------------


def get_observation_store() -> PriceObservationStore:
    """Load PriceObservationStore from the configured data directory."""
    return PriceObservationStore.load(
        _pricing_data_dir() / "price_observations.parquet"
    )


def get_canonical_store() -> CanonicalProductStore:
    """Load CanonicalProductStore from the configured data directory."""
    return CanonicalProductStore.load(
        _pricing_data_dir() / "canonical_products.parquet"
    )


def get_sku_store() -> RetailerSKUStore:
    """Load RetailerSKUStore from the configured data directory."""
    return RetailerSKUStore.load(_pricing_data_dir() / "retailer_skus.parquet")


def get_location_store() -> StoreLocationStore:
    """Load StoreLocationStore from the configured data directory."""
    return StoreLocationStore.load(
        _pricing_data_dir() / "store_locations.parquet"
    )
