"""Worker dependency providers for the OCR pipeline."""

from __future__ import annotations

import logging
from pathlib import Path

from allaroundfood.config import settings
from allaroundfood.ocr.parser import ReceiptParser
from allaroundfood.ocr.qwen_loader import FakeQwenVLClient, QwenVLClient
from allaroundfood.ocr.receipt_store import ReceiptStore
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore

logger = logging.getLogger(__name__)


def _ocr_data_dir() -> Path:
    """Return the OCR/pricing data directory resolved from settings."""
    return settings.pricing_data_dir.resolve()


def _pricing_data_dir() -> Path:
    """Return the pricing data directory resolved from settings."""
    return _ocr_data_dir() / "pricing"


def get_receipt_parser() -> ReceiptParser:
    """Return a ReceiptParser backed by a real or fake Qwen client."""
    gguf_path = settings.qwen_gguf_path
    if gguf_path is not None and gguf_path.exists():
        client: QwenVLClient | FakeQwenVLClient = QwenVLClient(gguf_path)
    else:
        logger.warning(
            "QWEN_GGUF_PATH not set or file missing; using FakeQwenVLClient. "
            "Run scripts/download_qwen.sh and set QWEN_GGUF_PATH for real OCR."
        )
        client = FakeQwenVLClient()
    return ReceiptParser(client)


def get_canonical_matcher() -> CanonicalMatcher:
    """Return a CanonicalMatcher using the production canonical product store."""
    store = CanonicalProductStore.load(_pricing_data_dir() / "canonical_products.parquet")
    try:
        from allaroundfood.pricing.canonical.embeddings import EmbeddingService

        return CanonicalMatcher(
            EmbeddingService(model_name=settings.embedding_model_name),
            store,
        )
    except ImportError:
        logger.warning(
            "%s: sentence-transformers/torch not installed; falling back to "
            "FakeEmbeddingService. Embedding-based matching disabled.",
            __name__,
        )
    return CanonicalMatcher(FakeEmbeddingService(), store)


def get_receipt_store() -> ReceiptStore:
    """Load ReceiptStore from the configured data directory."""
    return ReceiptStore.load(_ocr_data_dir() / "receipts.parquet")


def get_receipt_image_dir() -> Path:
    """Return the durable directory where receipt images are stored."""
    return _ocr_data_dir() / "receipt-images"


def get_observation_store() -> PriceObservationStore:
    """Load PriceObservationStore from the configured pricing data directory."""
    return PriceObservationStore.load(_pricing_data_dir() / "price_observations.parquet")
