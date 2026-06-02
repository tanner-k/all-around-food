"""Ingestion pipeline: PriceQuotes → canonical matching → stores.

Invariants:
- All store arguments are treated as immutable; new stores are returned.
- The caller is responsible for persisting the returned stores.
- Use :func:`ingest_and_persist` as a convenience wrapper that also saves.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from allaroundfood.pricing.adapters.base import PriceQuote
from allaroundfood.pricing.canonical.embeddings import EmbeddingService, FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher, MatchQuery
from allaroundfood.pricing.models import CanonicalProduct, PriceObservation, RetailerSKU
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore
from allaroundfood.pricing.store.retailer_sku_store import RetailerSKUStore

logger = logging.getLogger(__name__)

_AnyEmbeddingService = EmbeddingService | FakeEmbeddingService
_KROGER_RETAILER = "kroger"


class IngestionResult(BaseModel):
    """Summary of a completed ingestion run."""

    model_config = ConfigDict(frozen=True)

    quotes_processed: int
    canonical_products_created: int
    skus_upserted: int
    observations_written: int
    match_method_counts: dict[str, int]


class IngestionPipeline:
    """Tie together adapters, matcher, and stores into a single ingestion flow.

    Args:
        matcher: CanonicalMatcher instance (real or test double).
        embedding: Embedding service used to compute vectors for new canonicals.
        canonical_store: Starting canonical product store.
        sku_store: Starting retailer SKU store.
        observation_store: Starting price observation store.
        now: Callable returning the current UTC datetime (injectable for tests).
    """

    def __init__(
        self,
        matcher: CanonicalMatcher,
        embedding: _AnyEmbeddingService,
        canonical_store: CanonicalProductStore,
        sku_store: RetailerSKUStore,
        observation_store: PriceObservationStore,
        *,
        now: Callable[[], datetime] = lambda: datetime.now(tz=UTC),
    ) -> None:
        self._matcher = matcher
        self._embedding = embedding
        self._canonical_store = canonical_store
        self._sku_store = sku_store
        self._observation_store = observation_store
        self._now = now

    def ingest(
        self,
        adapter_name: str,
        store_location_id: str,
        quotes: list[PriceQuote],
    ) -> tuple[IngestionResult, CanonicalProductStore, RetailerSKUStore, PriceObservationStore]:
        """Process quotes and return updated stores without mutating inputs.

        Args:
            adapter_name: Identifies the source adapter (e.g. ``"kroger"``).
            store_location_id: Store location to associate observations with.
            quotes: List of price quotes from the adapter.

        Returns:
            Tuple of (IngestionResult, new_canonical_store, new_sku_store, new_obs_store).
            Input stores are unchanged.
        """
        canonical_store = self._canonical_store
        sku_store = self._sku_store
        observation_store = self._observation_store

        canonicals_created = 0
        skus_upserted = 0
        match_method_counts: dict[str, int] = {}
        ts = self._now()

        for quote in quotes:
            # Build match query
            gtin = quote.raw.get("gtin")
            if not isinstance(gtin, str) or not gtin:
                gtin = None
            query = MatchQuery(
                name=quote.title,
                brand=quote.brand,
                size_raw=quote.size_raw,
                gtin=gtin,
            )

            # Rebuild the matcher against the current (growing) canonical_store
            matcher = CanonicalMatcher(
                self._embedding,
                canonical_store,
                threshold=self._matcher.threshold,
                fuzzy_threshold=self._matcher.fuzzy_threshold,
            )
            match_result = matcher.match(query)

            if match_result is None:
                # Create new canonical product
                text = f"{quote.brand or ''} {quote.title} {quote.size_raw or ''}".strip()
                emb_vec = self._embedding.embed_one(text)
                canon = CanonicalProduct(
                    id=str(uuid.uuid4()),
                    gtin=gtin,
                    brand=quote.brand,
                    name=quote.title,
                    size_value=None,
                    size_unit=quote.size_raw,
                    category=None,
                    attributes={},
                    embedding=emb_vec.tolist(),
                    created_at=ts,
                    updated_at=ts,
                )
                canonical_store = canonical_store.add(canon)
                canonicals_created += 1
                method = "new"
                canonical_product_id = canon.id
                match_score = 0.0
                match_method: Any = "embedding"  # new canonical → embedding-based
            else:
                method = match_result.method
                canonical_product_id = match_result.canonical_product.id
                match_score = match_result.score
                match_method = match_result.method

            match_method_counts[method] = match_method_counts.get(method, 0) + 1

            # Upsert RetailerSKU by (retailer, retailer_sku)
            existing_sku = _find_sku(sku_store, quote.retailer, quote.retailer_sku)
            if existing_sku is not None:
                updated_sku = RetailerSKU(
                    id=existing_sku.id,
                    canonical_product_id=canonical_product_id,
                    retailer=quote.retailer,
                    retailer_sku=quote.retailer_sku,
                    url=quote.url,
                    title_raw=quote.title,
                    size_raw=quote.size_raw,
                    last_seen_at=ts,
                    match_method=match_method,
                    match_confidence=match_score,
                    retailer_meta={},
                )
                sku_store = sku_store.update(existing_sku.id, updated_sku)
            else:
                new_sku = RetailerSKU(
                    id=str(uuid.uuid4()),
                    canonical_product_id=canonical_product_id,
                    retailer=quote.retailer,
                    retailer_sku=quote.retailer_sku,
                    url=quote.url,
                    title_raw=quote.title,
                    size_raw=quote.size_raw,
                    last_seen_at=ts,
                    match_method=match_method,
                    match_confidence=match_score,
                    retailer_meta={},
                )
                sku_store = sku_store.add(new_sku)
            skus_upserted += 1

            # Determine source_tier
            source_tier: Any = (
                quote.source_tier
                if quote.source_tier is not None
                else "api"
                if quote.retailer == _KROGER_RETAILER
                else "json"
            )

            # Raw response hash
            raw_hash = hashlib.sha256(
                json.dumps(quote.raw, sort_keys=True).encode("utf-8")
            ).hexdigest()

            obs = PriceObservation(
                id=str(uuid.uuid4()),
                retailer=quote.retailer,
                store_location_id=store_location_id,
                retailer_sku_id=new_sku.id if existing_sku is None else existing_sku.id,
                canonical_product_id=canonical_product_id,
                price_cents=quote.price_cents,
                unit_price_cents=None,
                was_on_promo=quote.was_on_promo,
                promo_text=None,
                promo_price_cents=quote.promo_price_cents,
                currency="USD",
                observed_at=ts,
                source_tier=source_tier,
                raw_response_hash=raw_hash,
            )
            observation_store = observation_store.add(obs)

        result = IngestionResult(
            quotes_processed=len(quotes),
            canonical_products_created=canonicals_created,
            skus_upserted=skus_upserted,
            observations_written=len(quotes),
            match_method_counts=match_method_counts,
        )
        return result, canonical_store, sku_store, observation_store


def _find_sku(
    store: RetailerSKUStore,
    retailer: str,
    retailer_sku: str,
) -> RetailerSKU | None:
    """Linear scan for an existing SKU by (retailer, retailer_sku).

    Args:
        store: The store to search.
        retailer: Retailer identifier.
        retailer_sku: Retailer-specific SKU string.

    Returns:
        Matching RetailerSKU or None.
    """
    for sku in store.all():
        if sku.retailer == retailer and sku.retailer_sku == retailer_sku:
            return sku
    return None


def ingest_and_persist(
    pipeline: IngestionPipeline,
    adapter_name: str,
    store_location_id: str,
    quotes: list[PriceQuote],
) -> IngestionResult:
    """Ingest quotes and persist all three updated stores to disk.

    Args:
        pipeline: Configured IngestionPipeline.
        adapter_name: Source adapter name.
        store_location_id: Store location identifier.
        quotes: Price quotes to ingest.

    Returns:
        IngestionResult summary.
    """
    result, new_canonical, new_sku, new_obs = pipeline.ingest(
        adapter_name, store_location_id, quotes
    )
    new_canonical.save()
    new_sku.save()
    new_obs.save()
    return result
