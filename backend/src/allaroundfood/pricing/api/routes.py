"""FastAPI router for pricing endpoints.

Mounted at /pricing. All endpoints use dependency injection so tests can
supply in-memory stores via app.dependency_overrides.
"""

from __future__ import annotations

import polars as pl
from fastapi import APIRouter, Depends, HTTPException, Query

from allaroundfood.pricing.analytics.history import detect_promotions, price_history
from allaroundfood.pricing.analytics.retailer_ranking import (
    rank_basket,
    rank_retailers_for_product,
)
from allaroundfood.pricing.api.deps import (
    get_canonical_store,
    get_location_store,
    get_observation_store,
)
from allaroundfood.pricing.api.envelope import ApiResponse
from allaroundfood.pricing.api.schemas import (
    _ZIP_RE,
    BasketRankingResponse,
    BasketRequest,
    CanonicalProductSummary,
    PricePoint,
    PromoFlagResponse,
    RetailerRankingResponse,
)
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.store_location_store import StoreLocationStore

router = APIRouter(prefix="/pricing", tags=["pricing"])


def _obs_to_df(obs_store: PriceObservationStore) -> pl.DataFrame:
    """Convert all observations to a Polars DataFrame."""
    obs_list = obs_store.all()
    if not obs_list:
        return PriceObservationStore._empty_df()  # noqa: SLF001
    rows = [o.model_dump() for o in obs_list]
    return pl.DataFrame(rows).with_columns(
        pl.col("observed_at").cast(pl.Datetime("us", "UTC"))
    )


def _canonical_to_df(canonical_store: CanonicalProductStore) -> pl.DataFrame:
    """Convert canonical products to a Polars DataFrame (slim, no embedding)."""
    products = canonical_store.all()
    if not products:
        return pl.DataFrame(
            {
                "id": pl.Series([], dtype=pl.String),
                "name": pl.Series([], dtype=pl.String),
                "brand": pl.Series([], dtype=pl.String),
                "size_value": pl.Series([], dtype=pl.Float64),
                "size_unit": pl.Series([], dtype=pl.String),
                "category": pl.Series([], dtype=pl.String),
            }
        )
    return pl.DataFrame(
        {
            "id": [p.id for p in products],
            "name": [p.name for p in products],
            "brand": [p.brand for p in products],
            "size_value": [p.size_value for p in products],
            "size_unit": [p.size_unit for p in products],
            "category": [p.category for p in products],
        }
    )


# ---------------------------------------------------------------------------
# GET /pricing/search
# ---------------------------------------------------------------------------


@router.get("/search", response_model=ApiResponse[list[CanonicalProductSummary]])
async def search_products(
    q: str = Query(..., min_length=1, description="Substring to match on name or brand"),
    zip: str | None = Query(  # noqa: A002
        default=None,
        description="5-digit US ZIP code to narrow by store availability",
    ),
    canonical_store: CanonicalProductStore = Depends(get_canonical_store),
    obs_store: PriceObservationStore = Depends(get_observation_store),
    location_store: StoreLocationStore = Depends(get_location_store),
) -> ApiResponse[list[CanonicalProductSummary]]:
    """Search canonical products by name/brand substring.

    Args:
        q: Substring to match (case-insensitive) against name and brand.
        zip: Optional ZIP to narrow results to products available in that area.
        canonical_store: Injected canonical product store.
        obs_store: Injected observation store.
        location_store: Injected store location store.

    Returns:
        ApiResponse containing up to 50 matching CanonicalProductSummary items.

    Raises:
        HTTPException: 400 if ZIP format is invalid.
    """
    if zip is not None and not _ZIP_RE.match(zip):
        raise HTTPException(
            status_code=400,
            detail="zip must be a 5-digit US ZIP code (e.g. '90210')",
        )

    canonical_df = _canonical_to_df(canonical_store)

    # ZIP filter: restrict to canonical IDs that have observations at matching locations
    if zip is not None and not canonical_df.is_empty():
        zip_location_ids = {loc.id for loc in location_store.all() if loc.zip == zip}
        obs_df = _obs_to_df(obs_store)
        if zip_location_ids and not obs_df.is_empty():
            available_canonical_ids = (
                obs_df.filter(pl.col("store_location_id").is_in(list(zip_location_ids)))
                .select("canonical_product_id")
                .unique()["canonical_product_id"]
                .to_list()
            )
            canonical_df = canonical_df.filter(
                pl.col("id").is_in(available_canonical_ids)
            )
        else:
            canonical_df = canonical_df.filter(pl.lit(False))

    if canonical_df.is_empty():
        return ApiResponse(success=True, data=[])

    q_lower = q.lower()
    matches = canonical_df.filter(
        pl.col("name").str.to_lowercase().str.contains(q_lower, literal=True)
        | pl.col("brand").str.to_lowercase().str.contains(q_lower, literal=True)
    ).head(50)

    results: list[CanonicalProductSummary] = [
        CanonicalProductSummary(
            canonical_product_id=row["id"],
            name=row["name"],
            brand=row["brand"],
            size_value=row["size_value"],
            size_unit=row["size_unit"],
            category=row["category"],
        )
        for row in matches.iter_rows(named=True)
    ]
    return ApiResponse(success=True, data=results)


# ---------------------------------------------------------------------------
# GET /pricing/compare
# ---------------------------------------------------------------------------


@router.get("/compare", response_model=ApiResponse[list[RetailerRankingResponse]])
async def compare_prices(
    canonical_id: str = Query(..., description="Canonical product ID"),
    zip: str | None = Query(  # noqa: A002
        default=None, description="5-digit US ZIP code to filter store locations"
    ),
    obs_store: PriceObservationStore = Depends(get_observation_store),
    location_store: StoreLocationStore = Depends(get_location_store),
) -> ApiResponse[list[RetailerRankingResponse]]:
    """Compare retailer prices for a canonical product, optionally filtered by ZIP.

    Args:
        canonical_id: The canonical product ID to compare.
        zip: Optional ZIP code to narrow by store location.
        obs_store: Injected observation store.
        location_store: Injected location store.

    Returns:
        ApiResponse containing ranked list of retailers by price.

    Raises:
        HTTPException: 400 if ZIP format is invalid.
    """
    if zip is not None and not _ZIP_RE.match(zip):
        raise HTTPException(
            status_code=400,
            detail="zip must be a 5-digit US ZIP code",
        )

    obs_df = _obs_to_df(obs_store)
    rankings = rank_retailers_for_product(
        canonical_id,
        obs_df,
        store_zip=zip,
        store_location_store=location_store if zip is not None else None,
    )
    data: list[RetailerRankingResponse] = [
        RetailerRankingResponse(
            retailer=r.retailer,
            store_location_id=r.store_location_id,
            price_cents=r.price_cents,
            observed_at=r.observed_at,
            rank=r.rank,
        )
        for r in rankings
    ]
    return ApiResponse(success=True, data=data)


# ---------------------------------------------------------------------------
# GET /pricing/history
# ---------------------------------------------------------------------------


@router.get("/history", response_model=ApiResponse[list[PricePoint]])
async def get_price_history(
    canonical_id: str = Query(..., description="Canonical product ID"),
    zip: str | None = Query(  # noqa: A002
        default=None, description="5-digit US ZIP to filter store locations"
    ),
    days: int = Query(
        default=30,
        ge=1,
        le=365,
        description="Number of days of history to return",
    ),
    obs_store: PriceObservationStore = Depends(get_observation_store),
    location_store: StoreLocationStore = Depends(get_location_store),
) -> ApiResponse[list[PricePoint]]:
    """Return historical price points for a canonical product.

    Args:
        canonical_id: The product to query history for.
        zip: Optional ZIP to narrow by store location.
        days: Window in days (1–365).
        obs_store: Injected observation store.
        location_store: Injected location store.

    Returns:
        ApiResponse containing price points sorted by observed_at ascending.

    Raises:
        HTTPException: 400 if ZIP format is invalid.
    """
    if zip is not None and not _ZIP_RE.match(zip):
        raise HTTPException(
            status_code=400,
            detail="zip must be a 5-digit US ZIP code",
        )

    obs_df = _obs_to_df(obs_store)

    if zip is not None:
        zip_location_ids = {loc.id for loc in location_store.all() if loc.zip == zip}
        if zip_location_ids:
            obs_df = obs_df.filter(
                pl.col("store_location_id").is_in(list(zip_location_ids))
            )
        else:
            return ApiResponse(success=True, data=[])

    history_df = price_history(canonical_id, obs_df, window_days=days)

    price_points: list[PricePoint] = [
        PricePoint(
            observed_at=row["observed_at"],
            retailer=row["retailer"],
            store_location_id=row["store_location_id"],
            price_cents=int(row["price_cents"]),
            was_on_promo=bool(row["was_on_promo"]),
        )
        for row in history_df.iter_rows(named=True)
    ]
    return ApiResponse(success=True, data=price_points)


# ---------------------------------------------------------------------------
# GET /pricing/promotions
# ---------------------------------------------------------------------------


@router.get("/promotions", response_model=ApiResponse[list[PromoFlagResponse]])
async def get_promotions(
    days: int = Query(
        default=14,
        ge=1,
        le=365,
        description="Detection window in days (recent observations to scan)",
    ),
    obs_store: PriceObservationStore = Depends(get_observation_store),
) -> ApiResponse[list[PromoFlagResponse]]:
    """Detect promotional price drops over a recent window.

    Args:
        days: Detection window in days (1–365). Baseline uses the prior 90 days.
        obs_store: Injected observation store.

    Returns:
        ApiResponse containing detected PromoFlag entries.
    """
    obs_df = _obs_to_df(obs_store)
    flags = detect_promotions(obs_df, detection_window_days=days)
    promo_data: list[PromoFlagResponse] = [
        PromoFlagResponse(
            canonical_product_id=f.canonical_product_id,
            retailer=f.retailer,
            store_location_id=f.store_location_id,
            baseline_price_cents=f.baseline_price_cents,
            drop_price_cents=f.drop_price_cents,
            zscore=f.zscore,
            observed_at=f.observed_at,
            was_marked_promo=f.was_marked_promo,
        )
        for f in flags
    ]
    return ApiResponse(success=True, data=promo_data)


# ---------------------------------------------------------------------------
# POST /pricing/basket
# ---------------------------------------------------------------------------


@router.post("/basket", response_model=ApiResponse[list[BasketRankingResponse]])
async def post_basket(
    body: BasketRequest,
    obs_store: PriceObservationStore = Depends(get_observation_store),
    location_store: StoreLocationStore = Depends(get_location_store),
) -> ApiResponse[list[BasketRankingResponse]]:
    """Compute per-retailer basket totals for a list of canonical products.

    Args:
        body: Request with canonical_product_ids list and optional ZIP.
        obs_store: Injected observation store.
        location_store: Injected location store.

    Returns:
        ApiResponse containing BasketRanking per retailer, sorted by total_cents.
    """
    obs_df = _obs_to_df(obs_store)

    if body.zip is not None:
        zip_location_ids = {
            loc.id for loc in location_store.all() if loc.zip == body.zip
        }
        if zip_location_ids:
            obs_df = obs_df.filter(
                pl.col("store_location_id").is_in(list(zip_location_ids))
            )
        else:
            return ApiResponse(success=True, data=[])

    rankings = rank_basket(body.canonical_product_ids, obs_df)
    basket_data: list[BasketRankingResponse] = [
        BasketRankingResponse(
            retailer=r.retailer,
            total_cents=r.total_cents,
            items_covered=r.items_covered,
            items_missing=r.items_missing,
        )
        for r in rankings
    ]
    return ApiResponse(success=True, data=basket_data)
