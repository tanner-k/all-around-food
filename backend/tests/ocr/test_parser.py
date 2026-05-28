"""Tests for the receipt parser module."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image

from allaroundfood.ocr.models import Receipt
from allaroundfood.ocr.parser import ReceiptParseError, ReceiptParser
from allaroundfood.ocr.preprocess import PreprocessedReceipt
from allaroundfood.ocr.qwen_loader import FakeQwenVLClient

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "ocr"


def _make_tiny_png(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        img = Image.new("RGB", (4, 4), color=(255, 0, 0))
        img.save(path, format="PNG")


def _make_preprocessed(tmp_path: Path) -> PreprocessedReceipt:
    """Build a PreprocessedReceipt pointing at a tiny fixture PNG."""
    tiny = FIXTURE_DIR / "tiny.png"
    _make_tiny_png(tiny)
    # Copy to a grayscale PNG in tmp_path to simulate preprocessing
    from PIL import ImageOps

    img = ImageOps.grayscale(Image.open(tiny))
    out = tmp_path / "page_001.png"
    img.save(out, format="PNG")
    return PreprocessedReceipt(
        original_path=tiny,
        page_images=[out],
        is_multipage=False,
    )


def _canned_receipt_json() -> str:
    return json.dumps(
        {
            "retailer_guess": "Whole Foods",
            "purchased_at": "2024-03-15T10:30:00",
            "subtotal_cents": 1500,
            "tax_cents": 120,
            "total_cents": 1620,
            "parse_confidence": 0.92,
            "line_items": [
                {
                    "line_no": 1,
                    "raw_text": "Organic Bananas 1lb $1.29",
                    "parsed_name": "Organic Bananas",
                    "parsed_qty": 1.0,
                    "parsed_unit": "lb",
                    "price_cents": 129,
                },
                {
                    "line_no": 2,
                    "raw_text": "Almond Milk 64oz $3.99",
                    "parsed_name": "Almond Milk",
                    "parsed_qty": None,
                    "parsed_unit": "oz",
                    "price_cents": 399,
                },
            ],
        }
    )


class TestReceiptParser:
    def test_parse_returns_receipt_with_line_items(self, tmp_path: Path) -> None:
        """ReceiptParser.parse() returns a Receipt with expected line items."""
        preprocessed = _make_preprocessed(tmp_path)
        client = FakeQwenVLClient(canned={"default": _canned_receipt_json()})
        parser = ReceiptParser(client)

        receipt = parser.parse(preprocessed)

        assert isinstance(receipt, Receipt)
        assert receipt.retailer_guess == "Whole Foods"
        assert receipt.total_cents == 1620
        assert receipt.parse_confidence == pytest.approx(0.92)
        assert len(receipt.line_items) == 2
        assert receipt.line_items[0].parsed_name == "Organic Bananas"
        assert receipt.line_items[0].price_cents == 129
        assert receipt.line_items[1].parsed_name == "Almond Milk"
        assert receipt.line_items[1].parsed_unit == "oz"

    def test_parse_assigns_receipt_id_to_line_items(self, tmp_path: Path) -> None:
        """Each line item's receipt_id matches the parent Receipt.id."""
        preprocessed = _make_preprocessed(tmp_path)
        client = FakeQwenVLClient(canned={"default": _canned_receipt_json()})
        parser = ReceiptParser(client)

        receipt = parser.parse(preprocessed)

        for item in receipt.line_items:
            assert item.receipt_id == receipt.id

    def test_parse_sets_parser_engine(self, tmp_path: Path) -> None:
        """parser_engine is always 'qwen-vl'."""
        preprocessed = _make_preprocessed(tmp_path)
        client = FakeQwenVLClient(canned={"default": _canned_receipt_json()})
        parser = ReceiptParser(client)

        receipt = parser.parse(preprocessed)

        assert receipt.parser_engine == "qwen-vl"

    def test_malformed_json_raises_receipt_parse_error(self, tmp_path: Path) -> None:
        """Malformed JSON from the LLM raises ReceiptParseError."""
        preprocessed = _make_preprocessed(tmp_path)
        bad_client = FakeQwenVLClient(canned={"default": "this is not json {"})
        parser = ReceiptParser(bad_client)

        with pytest.raises(ReceiptParseError) as exc_info:
            parser.parse(preprocessed)

        assert "invalid JSON" in str(exc_info.value)
        assert exc_info.value.raw_output == "this is not json {"

    def test_empty_line_items_when_none_in_response(self, tmp_path: Path) -> None:
        """Receipt with no line_items in JSON produces empty list."""
        no_items = json.dumps(
            {
                "retailer_guess": None,
                "purchased_at": None,
                "subtotal_cents": None,
                "tax_cents": None,
                "total_cents": None,
                "parse_confidence": 0.5,
                "line_items": [],
            }
        )
        preprocessed = _make_preprocessed(tmp_path)
        client = FakeQwenVLClient(canned={"default": no_items})
        parser = ReceiptParser(client)

        receipt = parser.parse(preprocessed)

        assert receipt.line_items == []
        assert receipt.retailer_guess is None
