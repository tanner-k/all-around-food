"""Tests for the embedding service.

FakeEmbeddingService is used for all non-slow tests so that CI
does not need to download the real model.  The @pytest.mark.slow
test exercises the real EmbeddingService and is skipped by default.
"""

from __future__ import annotations

import numpy as np
import pytest

from allaroundfood.pricing.canonical.embeddings import EmbeddingService, FakeEmbeddingService

_DIM = 384


class TestFakeEmbeddingService:
    def test_embed_returns_correct_shape(self) -> None:
        svc = FakeEmbeddingService()
        out = svc.embed(["apple juice 64oz", "organic milk"])
        assert out.shape == (2, _DIM)
        assert out.dtype == np.float32

    def test_embed_one_returns_correct_shape(self) -> None:
        svc = FakeEmbeddingService()
        out = svc.embed_one("Tropicana orange juice")
        assert out.shape == (_DIM,)
        assert out.dtype == np.float32

    def test_embed_is_deterministic(self) -> None:
        svc = FakeEmbeddingService()
        text = "Great Value whole milk 1 gallon"
        a = svc.embed_one(text)
        b = svc.embed_one(text)
        np.testing.assert_array_equal(a, b)

    def test_embed_different_texts_differ(self) -> None:
        svc = FakeEmbeddingService()
        a = svc.embed_one("apple")
        b = svc.embed_one("orange")
        assert not np.allclose(a, b)

    def test_embed_rows_are_unit_norm(self) -> None:
        svc = FakeEmbeddingService()
        texts = ["foo", "bar", "baz qux"]
        out = svc.embed(texts)
        norms = np.linalg.norm(out, axis=1)
        np.testing.assert_allclose(norms, np.ones(len(texts)), atol=1e-6)

    def test_embed_batch_matches_embed_one(self) -> None:
        svc = FakeEmbeddingService()
        texts = ["item one", "item two"]
        batch = svc.embed(texts)
        for i, t in enumerate(texts):
            np.testing.assert_array_equal(batch[i], svc.embed_one(t))


@pytest.mark.slow
def test_real_model_shape_and_norm() -> None:
    """Verify the real SentenceTransformer model produces correct output.

    Skipped by default — run with ``-m slow`` to exercise this test.
    """
    svc = EmbeddingService()
    texts = ["Organic whole milk 1 gallon", "Tropicana OJ 52 fl oz", "Cheerios cereal 18oz"]
    out = svc.embed(texts)
    assert out.shape == (3, _DIM), f"Expected (3, {_DIM}), got {out.shape}"
    assert out.dtype == np.float32
    norms = np.linalg.norm(out, axis=1)
    np.testing.assert_allclose(norms, np.ones(3), atol=1e-5)
