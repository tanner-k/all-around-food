"""Canonical product matcher.

Match flow:
  1. GTIN exact → score 1.0
  2. Embedding cosine similarity ≥ threshold → score = cosine sim
  3. rapidfuzz token_set_ratio ≥ fuzzy_threshold → score = ratio/100
  4. No match → None
"""

from __future__ import annotations

import logging
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict
from rapidfuzz import fuzz

from allaroundfood.pricing.canonical.embeddings import EmbeddingService, FakeEmbeddingService
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore

logger = logging.getLogger(__name__)

_AnyEmbeddingService = EmbeddingService | FakeEmbeddingService


class MatchQuery(BaseModel):
    """Input to the canonical matcher."""

    model_config = ConfigDict(frozen=True)

    name: str
    brand: str | None = None
    size_raw: str | None = None
    gtin: str | None = None


class MatchResult(BaseModel):
    """Output from the canonical matcher."""

    model_config = ConfigDict(frozen=True)

    canonical_product: CanonicalProduct
    score: float
    method: Literal["upc", "fuzzy", "embedding"]


class CanonicalMatcher:
    """Match retailer product descriptions to canonical products.

    Args:
        embedding: Embedding service (real or fake).
        store: Canonical product store to search against.
        threshold: Minimum cosine similarity for an embedding match.
        fuzzy_threshold: Minimum token_set_ratio (0–100) for a fuzzy match.
    """

    def __init__(
        self,
        embedding: _AnyEmbeddingService,
        store: CanonicalProductStore,
        *,
        threshold: float = 0.85,
        fuzzy_threshold: int = 90,
    ) -> None:
        self._embedding = embedding
        self._store = store
        self._threshold = threshold
        self._fuzzy_threshold = fuzzy_threshold

    @property
    def threshold(self) -> float:
        """Minimum cosine similarity for an embedding match."""
        return self._threshold

    @property
    def fuzzy_threshold(self) -> int:
        """Minimum token_set_ratio for a fuzzy match."""
        return self._fuzzy_threshold

    def match(self, query: MatchQuery) -> MatchResult | None:
        """Attempt to match query against the canonical product store.

        Args:
            query: The product description to match.

        Returns:
            MatchResult if a match is found, else None.
        """
        canonicals = self._store.all()

        # 1. GTIN exact match
        if query.gtin:
            for canon in canonicals:
                if canon.gtin and canon.gtin == query.gtin:
                    return MatchResult(
                        canonical_product=canon,
                        score=1.0,
                        method="upc",
                    )

        # 2. Embedding cosine similarity
        embedding_result = self._try_embedding_match(query, canonicals)
        if embedding_result is not None:
            return embedding_result

        # 3. Fuzzy token_set_ratio
        fuzzy_result = self._try_fuzzy_match(query, canonicals)
        if fuzzy_result is not None:
            return fuzzy_result

        return None

    def _try_embedding_match(
        self,
        query: MatchQuery,
        canonicals: list[CanonicalProduct],
    ) -> MatchResult | None:
        """Attempt embedding cosine-similarity match.

        Skips canonicals whose embedding is None.
        """
        # Build the embedding candidates: (index_in_canonicals, canon, emb_vector)
        candidates: list[tuple[int, CanonicalProduct, np.ndarray]] = []
        for idx, canon in enumerate(canonicals):
            if canon.embedding is not None:
                candidates.append((idx, canon, np.array(canon.embedding, dtype=np.float32)))

        if not candidates:
            return None

        query_text = f"{query.brand or ''} {query.name} {query.size_raw or ''}".strip()
        query_vec = self._embedding.embed_one(query_text)  # already L2-normalised

        # Stack candidate embeddings into matrix (m, 384)
        emb_matrix = np.stack([c[2] for c in candidates], axis=0)

        # Cosine similarity = dot product on unit vectors
        sims = emb_matrix @ query_vec  # (m,)

        best_idx = int(np.argmax(sims))
        best_score = float(sims[best_idx])

        if best_score >= self._threshold:
            _, best_canon, _ = candidates[best_idx]
            return MatchResult(
                canonical_product=best_canon,
                score=best_score,
                method="embedding",
            )

        return None

    def _try_fuzzy_match(
        self,
        query: MatchQuery,
        canonicals: list[CanonicalProduct],
    ) -> MatchResult | None:
        """Attempt rapidfuzz token_set_ratio fuzzy match."""
        query_text = f"{query.brand or ''} {query.name}".strip()

        best_ratio = -1.0
        best_canon: CanonicalProduct | None = None

        for canon in canonicals:
            canon_text = f"{canon.brand or ''} {canon.name}".strip()
            ratio = fuzz.token_set_ratio(query_text, canon_text)
            if ratio > best_ratio:
                best_ratio = ratio
                best_canon = canon

        if best_canon is not None and best_ratio >= self._fuzzy_threshold:
            return MatchResult(
                canonical_product=best_canon,
                score=best_ratio / 100.0,
                method="fuzzy",
            )

        return None
