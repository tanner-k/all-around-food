"""Embedding service for canonical product matching.

Uses BAAI/bge-small-en-v1.5 (384-dimensional, float32, L2-normalised).
Provides a FakeEmbeddingService for deterministic testing without
downloading the real model.
"""

from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_EMBEDDING_DIM = 384


class EmbeddingService:
    """Sentence-Transformers embedding service backed by bge-small-en-v1.5.

    The model is lazy-loaded on the first call to :meth:`embed` or
    :meth:`embed_one` so that importing the module does not trigger a
    heavyweight download.
    """

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        device: str = "cpu",
    ) -> None:
        """Initialise without loading the model.

        Args:
            model_name: HuggingFace model identifier.
            device: Torch device string (e.g. ``"cpu"``, ``"cuda"``).
        """
        self._model_name = model_name
        self._device = device
        self._model: SentenceTransformer | None = None

    def _load(self) -> SentenceTransformer:
        if self._model is None:
            from sentence_transformers import SentenceTransformer  # noqa: PLC0415

            logger.info("Loading embedding model %s on %s", self._model_name, self._device)
            self._model = SentenceTransformer(self._model_name, device=self._device)
        return self._model

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed a batch of texts.

        Args:
            texts: List of input strings.

        Returns:
            Float32 array of shape (n, 384) with L2-normalised rows.
        """
        model = self._load()
        vectors: np.ndarray = model.encode(
            texts,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vectors.astype(np.float32)

    def embed_one(self, text: str) -> np.ndarray:
        """Embed a single text.

        Args:
            text: Input string.

        Returns:
            Float32 array of shape (384,).
        """
        return self.embed([text])[0]


class FakeEmbeddingService:
    """Deterministic embedding service for use in tests.

    Maps each text to a 384-dimensional float32 vector via
    SHA-256 → seeded RNG, then L2-normalises. No model download required.
    """

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed a batch of texts deterministically.

        Args:
            texts: List of input strings.

        Returns:
            Float32 array of shape (n, 384) with L2-normalised rows.
        """
        rows = [self._single(t) for t in texts]
        return np.stack(rows, axis=0)

    def embed_one(self, text: str) -> np.ndarray:
        """Embed a single text deterministically.

        Args:
            text: Input string.

        Returns:
            Float32 array of shape (384,).
        """
        return self._single(text)

    @staticmethod
    def _single(text: str) -> np.ndarray:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        seed = int.from_bytes(digest[:4], byteorder="little")
        rng = np.random.default_rng(seed)
        vec = rng.standard_normal(_EMBEDDING_DIM).astype(np.float32)
        norm = np.linalg.norm(vec)
        if norm == 0.0:
            vec = np.ones(_EMBEDDING_DIM, dtype=np.float32) / np.sqrt(_EMBEDDING_DIM)
        else:
            vec = vec / norm
        return vec
