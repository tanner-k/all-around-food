"""Retailer ranking analytics — pure Polars functions, no I/O."""

from __future__ import annotations

from datetime import datetime

import polars as pl
from pydantic import BaseModel, ConfigDict

from allaroundfood.pricing.store.store_location_store import StoreLocationStore


class RetailerRanking(BaseModel):
    """Price ranking of one retailer for a single canonical product."""

    model_config = ConfigDict(frozen=True)

    retailer: str
    store_location_id: str
    price_cents: int
    observed_at: datetime
    rank: int


class BasketRanking(BaseModel):
    """Per-retailer basket total across multiple canonical products."""

    model_config = ConfigDict(frozen=True)

    retailer: str
    total_cents: int
    items_covered: int
    items_missing: int


def rank_retailers_for_product(
    canonical_product_id: str,
    observations_df: pl.DataFrame,
    *,
    store_zip: str | None = None,
    store_location_store: StoreLocationStore | None = None,
) -> list[RetailerRanking]:
    """Rank retailers by price for a single canonical product.

    Args:
        canonical_product_id: The canonical product to rank retailers for.
        observations_df: DataFrame with schema matching PriceObservationStore.
        store_zip: Optional ZIP code to filter by store location ZIP.
        store_location_store: Required when store_zip is provided.

    Returns:
        List of RetailerRanking sorted by price_cents ascending, then
        observed_at descending for ties, ranked 1-based.
    """
    filtered = observations_df.filter(
        pl.col("canonical_product_id") == canonical_product_id
    )

    # Apply ZIP filter when requested
    if store_zip is not None and store_location_store is not None:
        zip_locations = {
            loc.id
            for loc in store_location_store.all()
            if loc.zip == store_zip
        }
        if zip_locations:
            allowed = list(zip_locations)
            filtered = filtered.filter(pl.col("store_location_id").is_in(allowed))
        else:
            # No locations match the ZIP — return empty
            return []

    if filtered.is_empty():
        return []

    # Latest observation per (retailer, store_location_id)
    latest = (
        filtered.sort("observed_at", descending=True)
        .group_by(["retailer", "store_location_id"])
        .first()
        .sort(
            ["price_cents", "observed_at"],
            descending=[False, True],
        )
    )

    rankings: list[RetailerRanking] = []
    for rank, row in enumerate(latest.iter_rows(named=True), start=1):
        rankings.append(
            RetailerRanking(
                retailer=row["retailer"],
                store_location_id=row["store_location_id"],
                price_cents=int(row["price_cents"]),
                observed_at=row["observed_at"],
                rank=rank,
            )
        )
    return rankings


def rank_basket(
    canonical_product_ids: list[str],
    observations_df: pl.DataFrame,
) -> list[BasketRanking]:
    """Compute per-retailer basket totals using the cheapest latest price per product.

    For each retailer, the basket total is the sum of the minimum latest price
    across all store locations for each requested canonical product. Products
    with no observation for that retailer count as "missing".

    Args:
        canonical_product_ids: List of canonical product IDs in the basket.
        observations_df: DataFrame with schema matching PriceObservationStore.

    Returns:
        List of BasketRanking sorted by total_cents ascending.
    """
    if not canonical_product_ids or observations_df.is_empty():
        return []

    filtered = observations_df.filter(
        pl.col("canonical_product_id").is_in(canonical_product_ids)
    )

    if filtered.is_empty():
        return []

    # Latest price per (canonical_product_id, retailer, store_location_id)
    latest_per_group = (
        filtered.sort("observed_at", descending=True)
        .group_by(["canonical_product_id", "retailer", "store_location_id"])
        .first()
    )

    # Cheapest across store_locations per (canonical, retailer)
    cheapest_per_product = (
        latest_per_group.group_by(["canonical_product_id", "retailer"])
        .agg(pl.col("price_cents").min().alias("price_cents"))
    )

    # Sum per retailer
    totals = (
        cheapest_per_product.group_by("retailer")
        .agg(
            [
                pl.col("price_cents").sum().alias("total_cents"),
                pl.col("canonical_product_id").n_unique().alias("items_covered"),
            ]
        )
        .sort("total_cents")
    )

    n_requested = len(canonical_product_ids)
    return [
        BasketRanking(
            retailer=row["retailer"],
            total_cents=int(row["total_cents"]),
            items_covered=int(row["items_covered"]),
            items_missing=n_requested - int(row["items_covered"]),
        )
        for row in totals.iter_rows(named=True)
    ]
