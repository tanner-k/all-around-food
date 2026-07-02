"""Tests for POST /receipts/parse API route."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from allaroundfood.api import app
from allaroundfood.ocr.api.deps import (
    get_canonical_matcher,
    get_observation_store,
    get_receipt_image_dir,
    get_receipt_parser,
    get_receipt_store,
)
from allaroundfood.ocr.parser import ReceiptParser
from allaroundfood.ocr.qwen_loader import FakeQwenVLClient
from allaroundfood.ocr.receipt_store import ReceiptStore
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore

FIXTURE_DIR = Path(__file__).parent.parent.parent / "fixtures" / "ocr"


def _make_tiny_png() -> bytes:
    """Return bytes of a tiny 4x4 PNG."""
    buf = BytesIO()
    img = Image.new("RGB", (4, 4), color=(100, 200, 50))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _canned_response() -> str:
    return json.dumps(
        {
            "retailer_guess": "Test Mart",
            "purchased_at": None,
            "subtotal_cents": 129,
            "tax_cents": 10,
            "total_cents": 139,
            "parse_confidence": 0.88,
            "line_items": [
                {
                    "line_no": 1,
                    "raw_text": "Organic Bananas $1.29",
                    "parsed_name": "Organic Bananas",
                    "parsed_qty": None,
                    "parsed_unit": None,
                    "price_cents": 129,
                }
            ],
        }
    )


def _make_canonical_store(tmp_path: Path) -> CanonicalProductStore:
    now = datetime.now(UTC)
    product = CanonicalProduct(
        id="prod-banana",
        gtin=None,
        brand=None,
        name="Organic Bananas",
        size_value=None,
        size_unit=None,
        category=None,
        embedding=None,
        created_at=now,
        updated_at=now,
    )
    store = CanonicalProductStore(tmp_path / "canonical.parquet")
    return store.add(product)


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    """TestClient with all OCR deps overridden to use fakes."""
    canonical_store = _make_canonical_store(tmp_path)
    embedding = FakeEmbeddingService()
    fake_matcher = CanonicalMatcher(embedding, canonical_store, fuzzy_threshold=50)
    fake_parser = ReceiptParser(FakeQwenVLClient(canned={"default": _canned_response()}))
    fake_receipt_store = ReceiptStore(tmp_path / "receipts.parquet")
    fake_obs_store = PriceObservationStore(tmp_path / "price_obs.parquet")
    fake_image_dir = tmp_path / "receipt-images"

    app.dependency_overrides[get_receipt_parser] = lambda: fake_parser
    app.dependency_overrides[get_canonical_matcher] = lambda: fake_matcher
    app.dependency_overrides[get_receipt_store] = lambda: fake_receipt_store
    app.dependency_overrides[get_observation_store] = lambda: fake_obs_store
    app.dependency_overrides[get_receipt_image_dir] = lambda: fake_image_dir

    yield TestClient(app)

    app.dependency_overrides.clear()


class TestPostReceiptsParse:
    def test_upload_tiny_png_returns_200(self, client: TestClient) -> None:
        """Uploading a tiny PNG returns HTTP 200 with structured response."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
        )
        assert response.status_code == 200

    def test_response_has_success_true(self, client: TestClient) -> None:
        """Response envelope has success=True."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
        )
        body = response.json()
        assert body["success"] is True

    def test_response_data_has_receipt(self, client: TestClient) -> None:
        """response.data.receipt is present and has expected fields."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
        )
        data = response.json()["data"]
        assert "receipt" in data
        assert data["receipt"]["parser_engine"] == "qwen-vl"
        assert data["receipt"]["retailer_guess"] == "Test Mart"

    def test_persisted_receipt_image_path_exists(self, client: TestClient) -> None:
        """response.data.receipt.image_path points at the durable uploaded image."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
        )
        data = response.json()["data"]
        image_path = Path(data["receipt"]["image_path"])
        assert image_path.exists()
        assert image_path.name.endswith(".png")
        assert image_path.read_bytes() == png_bytes

    def test_response_data_has_observations(self, client: TestClient) -> None:
        """response.data.observations is a list (may be empty if no match)."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
        )
        data = response.json()["data"]
        assert "observations" in data
        assert isinstance(data["observations"], list)

    def test_unsupported_content_type_returns_400(self, client: TestClient) -> None:
        """Uploading a TIFF returns 400."""
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.tiff", b"fake", "image/tiff")},
        )
        assert response.status_code == 400

    def test_retailer_form_field_accepted(self, client: TestClient) -> None:
        """retailer form field is accepted without error."""
        png_bytes = _make_tiny_png()
        response = client.post(
            "/receipts/parse",
            files={"image": ("receipt.png", png_bytes, "image/png")},
            data={"retailer": "Kroger", "store_location_id": "loc-001"},
        )
        assert response.status_code == 200
