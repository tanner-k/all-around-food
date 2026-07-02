"""FastAPI dependency providers for the OCR pipeline.

In dev (no QWEN_GGUF_PATH), the parser is backed by FakeQwenVLClient so the
service starts without a real model. Production sets QWEN_GGUF_PATH.
"""

from __future__ import annotations

import logging
from pathlib import Path

from allaroundfood.config import settings
from allaroundfood.ocr.parser import ReceiptParser
from allaroundfood.ocr.qwen_loader import FakeQwenVLClient, QwenVLClient
from allaroundfood.ocr.receipt_store import ReceiptStore
from allaroundfood.pricing.api.deps import get_canonical_store
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore

logger = logging.getLogger(__name__)


def _ocr_data_dir() -> Path:
    """Return the OCR data directory resolved from Settings.pricing_data_dir.

    ``settings.pricing_data_dir`` defaults to the repository ``data`` directory
    so backend startup location does not change which Parquet files are used.
    """
    return settings.pricing_data_dir.resolve()


def get_receipt_parser() -> ReceiptParser:
    """Return a ReceiptParser backed by real or fake Qwen client.

    Uses QwenVLClient if QWEN_GGUF_PATH is set; falls back to FakeQwenVLClient
    with a warning so the service remains startable in dev.
    """
    gguf_path = settings.qwen_gguf_path
    if gguf_path is not None and gguf_path.exists():
        client: QwenVLClient | FakeQwenVLClient = QwenVLClient(gguf_path)
    else:
        logger.warning(
            "QWEN_GGUF_PATH not set or file missing — using FakeQwenVLClient. "
            "Run scripts/download_qwen.sh and set QWEN_GGUF_PATH for real OCR."
        )
        client = FakeQwenVLClient()
    return ReceiptParser(client)


def get_canonical_matcher() -> CanonicalMatcher:
    """Return a CanonicalMatcher using the production canonical product store.

    Attempts to use the real EmbeddingService (sentence-transformers). Falls
    back to FakeEmbeddingService with a warning when the optional dependency is
    not installed — embedding-based matching is disabled in that case and only
    GTIN/fuzzy matching will work.
    """
    store = get_canonical_store()
    embedding: FakeEmbeddingService
    try:
        from allaroundfood.pricing.canonical.embeddings import EmbeddingService

        real_embedding = EmbeddingService(model_name=settings.embedding_model_name)
        return CanonicalMatcher(real_embedding, store)
    except ImportError:
        logger.warning(
            "%s: sentence-transformers/torch not installed — falling back to "
            "FakeEmbeddingService. Embedding-based matching disabled; only "
            "GTIN/fuzzy will work. Install sentence-transformers to enable.",
            __name__,
        )
        embedding = FakeEmbeddingService()
    return CanonicalMatcher(embedding, store)


def get_receipt_store() -> ReceiptStore:
    """Load ReceiptStore from the configured data directory."""
    return ReceiptStore.load(_ocr_data_dir() / "receipts.parquet")


def get_receipt_image_dir() -> Path:
    """Return the durable directory where uploaded receipt images are stored."""
    return _ocr_data_dir() / "receipt-images"


def get_observation_store() -> PriceObservationStore:
    """Load PriceObservationStore from the configured pricing data directory."""
    return PriceObservationStore.load(
        _ocr_data_dir() / "pricing" / "price_observations.parquet"
    )
