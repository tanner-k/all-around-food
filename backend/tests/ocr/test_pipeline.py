"""End-to-end test for the full OCR receipt pipeline.

Chain: preprocess → parse (FakeQwenVL) → map_receipt_to_observations.
No real model, no real file I/O beyond the tiny PNG fixture.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image

from allaroundfood.ocr.parser import ReceiptParser
from allaroundfood.ocr.preprocess import preprocess_receipt
from allaroundfood.ocr.qwen_loader import FakeQwenVLClient
from allaroundfood.ocr.to_observations import map_receipt_to_observations
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "ocr"
CANNED_JSON_PATH = FIXTURE_DIR / "canned_response.json"


def _make_tiny_png() -> Path:
    """Return path to the shared tiny 4x4 PNG fixture."""
    tiny = FIXTURE_DIR / "tiny.png"
    tiny.parent.mkdir(parents=True, exist_ok=True)
    if not tiny.exists():
        img = Image.new("RGB", (4, 4), color=(200, 100, 50))
        img.save(tiny, format="PNG")
    return tiny


def _build_canonical_store(tmp_path: Path) -> CanonicalProductStore:
    """Build an in-memory CanonicalProductStore with 3 products."""
    now = datetime.now(UTC)
    products = [
        CanonicalProduct(
            id="p-bananas",
            gtin=None,
            brand=None,
            name="Organic Bananas",
            size_value=None,
            size_unit=None,
            category="produce",
            embedding=None,
            created_at=now,
            updated_at=now,
        ),
        CanonicalProduct(
            id="p-milk",
            gtin=None,
            brand=None,
            name="Almond Milk",
            size_value=None,
            size_unit=None,
            category="dairy-alt",
            embedding=None,
            created_at=now,
            updated_at=now,
        ),
        CanonicalProduct(
            id="p-eggs",
            gtin=None,
            brand=None,
            name="Large Eggs",
            size_value=None,
            size_unit=None,
            category="dairy",
            embedding=None,
            created_at=now,
            updated_at=now,
        ),
    ]
    store = CanonicalProductStore(tmp_path / "canonical.parquet")
    for p in products:
        store = store.add(p)
    return store


class TestFullPipeline:
    def test_preprocess_parse_map_chain(self, tmp_path: Path) -> None:
        """Full pipeline: preprocess → parse → map produces observations."""
        # 1. Preprocess
        tiny_png = _make_tiny_png()
        preprocessed = preprocess_receipt(tiny_png, output_dir=tmp_path)

        # 2. Parse via FakeQwenVLClient with canned fixture
        canned_text = CANNED_JSON_PATH.read_text()
        client = FakeQwenVLClient(canned={"default": canned_text})
        parser = ReceiptParser(client)
        receipt = parser.parse(preprocessed)

        # 3. Map to observations
        store = _build_canonical_store(tmp_path)
        embedding = FakeEmbeddingService()
        matcher = CanonicalMatcher(embedding, store, fuzzy_threshold=50)
        observations = map_receipt_to_observations(receipt, matcher)

        # Assertions
        assert receipt.retailer_guess == "Green Grocer"
        assert receipt.total_cents == 677
        assert len(receipt.line_items) == 3

        assert len(observations) == 3
        for obs in observations:
            assert obs.source_tier == "ocr"
            assert obs.retailer == "Green Grocer"

        product_ids = {obs.canonical_product_id for obs in observations}
        assert "p-bananas" in product_ids
        assert "p-milk" in product_ids
        assert "p-eggs" in product_ids

    def test_pipeline_with_no_matching_products(self, tmp_path: Path) -> None:
        """When no canonical products exist, map returns an empty list."""
        tiny_png = _make_tiny_png()
        out_dir = tmp_path / "preprocess_out"
        out_dir.mkdir()
        preprocessed = preprocess_receipt(tiny_png, output_dir=out_dir)

        canned_text = CANNED_JSON_PATH.read_text()
        client = FakeQwenVLClient(canned={"default": canned_text})
        parser = ReceiptParser(client)
        receipt = parser.parse(preprocessed)

        # Empty canonical store → no matches
        empty_store = CanonicalProductStore(tmp_path / "empty.parquet")
        embedding = FakeEmbeddingService()
        matcher = CanonicalMatcher(embedding, empty_store, fuzzy_threshold=50)
        observations = map_receipt_to_observations(receipt, matcher)

        assert observations == []
