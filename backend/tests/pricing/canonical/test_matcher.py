"""Tests for CanonicalMatcher.

Uses FakeEmbeddingService to avoid downloading the real model.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher, MatchQuery
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore

_NOW = datetime(2025, 1, 1, tzinfo=UTC)
_PATH = Path("/tmp/test_canonicals.parquet")


def _make_canon(
    canon_id: str,
    name: str,
    brand: str | None = None,
    gtin: str | None = None,
    with_embedding: bool = True,
) -> CanonicalProduct:
    svc = FakeEmbeddingService()
    text = f"{brand or ''} {name}".strip()
    emb: list[float] | None = svc.embed_one(text).tolist() if with_embedding else None
    return CanonicalProduct(
        id=canon_id,
        gtin=gtin,
        brand=brand,
        name=name,
        size_value=None,
        size_unit=None,
        category=None,
        attributes={},
        embedding=emb,
        created_at=_NOW,
        updated_at=_NOW,
    )


def _build_store(products: list[CanonicalProduct]) -> CanonicalProductStore:
    store = CanonicalProductStore(_PATH)
    for p in products:
        store = store.add(p)
    return store


@pytest.fixture()
def canonicals() -> list[CanonicalProduct]:
    return [
        _make_canon("c1", "Whole Milk 1 Gallon", brand="Great Value", gtin="012345678901"),
        _make_canon("c2", "Orange Juice 52 fl oz", brand="Tropicana", gtin="012345678902"),
        _make_canon("c3", "Cheerios Cereal 18 oz", brand="General Mills"),
        _make_canon("c4", "Organic Baby Spinach 5 oz", brand="Earthbound Farm"),
        _make_canon("c5", "Sourdough Bread Loaf", brand="Dave's Killer Bread"),
        # No embedding — should be skipped in embedding step
        _make_canon("c6", "Mystery Item", brand="Unknown Brand", with_embedding=False),
    ]


@pytest.fixture()
def store(canonicals: list[CanonicalProduct]) -> CanonicalProductStore:
    return _build_store(canonicals)


@pytest.fixture()
def svc() -> FakeEmbeddingService:
    return FakeEmbeddingService()


# ---------------------------------------------------------------------------
# GTIN exact match
# ---------------------------------------------------------------------------


def test_gtin_match(store: CanonicalProductStore, svc: FakeEmbeddingService) -> None:
    matcher = CanonicalMatcher(svc, store)
    query = MatchQuery(name="Whole Milk", gtin="012345678901")
    result = matcher.match(query)
    assert result is not None
    assert result.canonical_product.id == "c1"
    assert result.method == "upc"
    assert result.score == 1.0


def test_gtin_match_takes_priority_over_other_paths(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    """Even if name matches something else, GTIN wins."""
    matcher = CanonicalMatcher(svc, store)
    query = MatchQuery(
        name="Orange Juice 52 fl oz",  # would match c2 via embedding/fuzzy
        brand="Tropicana",
        gtin="012345678901",  # but GTIN points to c1
    )
    result = matcher.match(query)
    assert result is not None
    assert result.canonical_product.id == "c1"
    assert result.method == "upc"


def test_gtin_not_found_falls_through(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    """Unknown GTIN should not match via GTIN path (falls through)."""
    matcher = CanonicalMatcher(svc, store, threshold=0.0)  # zero threshold so embedding wins
    query = MatchQuery(name="Whole Milk 1 Gallon", brand="Great Value", gtin="999999999999")
    result = matcher.match(query)
    # Should still find via embedding (threshold=0.0)
    assert result is not None
    assert result.method == "embedding"


# ---------------------------------------------------------------------------
# Embedding match
# ---------------------------------------------------------------------------


def test_embedding_match(store: CanonicalProductStore, svc: FakeEmbeddingService) -> None:
    """Query text that is identical to a canonical's embedding text should score ~1.0."""
    matcher = CanonicalMatcher(svc, store, threshold=0.85)
    query = MatchQuery(name="Whole Milk 1 Gallon", brand="Great Value")
    result = matcher.match(query)
    assert result is not None
    assert result.method == "embedding"
    assert result.canonical_product.id == "c1"
    assert result.score >= 0.85


def test_embedding_match_below_threshold_returns_none(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    """With a very high threshold nothing should match."""
    matcher = CanonicalMatcher(svc, store, threshold=0.9999, fuzzy_threshold=101)
    query = MatchQuery(name="XYZ completely unrelated product name qwerty")
    result = matcher.match(query)
    assert result is None


def test_embedding_skips_canonicals_without_embedding(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    """c6 has no embedding; ensure it is never returned via embedding path."""
    matcher = CanonicalMatcher(svc, store, threshold=0.0)
    query = MatchQuery(name="Mystery Item", brand="Unknown Brand")
    result = matcher.match(query)
    if result is not None and result.method == "embedding":
        assert result.canonical_product.id != "c6"


# ---------------------------------------------------------------------------
# Fuzzy match
# ---------------------------------------------------------------------------


def test_fuzzy_match(store: CanonicalProductStore, svc: FakeEmbeddingService) -> None:
    """Use threshold=2.0 to force past embedding; verify fuzzy path fires."""
    matcher = CanonicalMatcher(svc, store, threshold=2.0, fuzzy_threshold=80)
    query = MatchQuery(name="Cheerios Cereal", brand="General Mills")
    result = matcher.match(query)
    assert result is not None
    assert result.method == "fuzzy"
    assert result.canonical_product.id == "c3"
    assert result.score >= 0.80


def test_fuzzy_just_below_threshold_returns_none(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    """If the best fuzzy score is just under the threshold, return None."""
    # Use a very high fuzzy threshold and impossibly high embedding threshold
    matcher = CanonicalMatcher(svc, store, threshold=2.0, fuzzy_threshold=101)
    query = MatchQuery(name="Cheerios Cereal", brand="General Mills")
    result = matcher.match(query)
    assert result is None


# ---------------------------------------------------------------------------
# No match
# ---------------------------------------------------------------------------


def test_no_match_returns_none(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    matcher = CanonicalMatcher(svc, store, threshold=0.9999, fuzzy_threshold=101)
    query = MatchQuery(name="zzzz totally unmatched aaaa product bbbbb")
    result = matcher.match(query)
    assert result is None


def test_store_is_not_mutated(
    store: CanonicalProductStore, svc: FakeEmbeddingService
) -> None:
    before = store.all()
    matcher = CanonicalMatcher(svc, store)
    matcher.match(MatchQuery(name="Milk", brand="Great Value"))
    assert len(store.all()) == len(before)
