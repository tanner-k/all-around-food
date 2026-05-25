"""Tests for the receipt → PriceObservation mapper."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from allaroundfood.ocr.models import Receipt, ReceiptLineItem
from allaroundfood.ocr.to_observations import map_receipt_to_observations
from allaroundfood.pricing.canonical.embeddings import FakeEmbeddingService
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.models import CanonicalProduct
from allaroundfood.pricing.store.canonical_product_store import CanonicalProductStore


def _make_product(product_id: str, name: str) -> CanonicalProduct:
    now = datetime.now(UTC)
    return CanonicalProduct(
        id=product_id,
        gtin=None,
        brand=None,
        name=name,
        size_value=None,
        size_unit=None,
        category=None,
        embedding=None,
        created_at=now,
        updated_at=now,
    )


def _make_line_item(
    line_no: int, name: str, receipt_id: str, price_cents: int = 199
) -> ReceiptLineItem:
    return ReceiptLineItem(
        id=f"line-{line_no}",
        receipt_id=receipt_id,
        line_no=line_no,
        raw_text=f"Line {line_no}: {name} ${price_cents/100:.2f}",
        parsed_name=name,
        parsed_qty=None,
        parsed_unit=None,
        price_cents=price_cents,
    )


def _build_matcher_with_products(
    tmp_path: Path, products: list[CanonicalProduct]
) -> CanonicalMatcher:
    """Build an in-memory CanonicalMatcher seeded with the given products."""
    store = CanonicalProductStore(tmp_path / "canonical.parquet")
    for product in products:
        store = store.add(product)

    embedding_service = FakeEmbeddingService()
    return CanonicalMatcher(
        embedding_service,
        store,
        fuzzy_threshold=50,  # lowered for test names that aren't identical
    )


def _make_receipt(line_items: list[ReceiptLineItem]) -> Receipt:
    now = datetime.now(UTC)
    return Receipt(
        id="receipt-001",
        image_path="/tmp/test.png",
        retailer_guess="Test Store",
        store_location_id="loc-001",
        purchased_at=now,
        subtotal_cents=sum(i.price_cents for i in line_items),
        tax_cents=None,
        total_cents=None,
        raw_text="{}",
        parser_engine="qwen-vl",
        llm_model="qwen2-vl",
        parse_confidence=0.9,
        created_at=now,
        line_items=line_items,
    )


class TestMapReceiptToObservations:
    def test_three_matched_two_unmatched(self, tmp_path: Path) -> None:
        """3 matching items produce 3 observations; 2 unmatched items are skipped."""
        banana = _make_product("prod-1", "Organic Bananas")
        milk = _make_product("prod-2", "Almond Milk")
        eggs = _make_product("prod-3", "Large Eggs")

        matcher = _build_matcher_with_products(tmp_path, [banana, milk, eggs])

        receipt = _make_receipt(
            [
                _make_line_item(1, "Organic Bananas", "receipt-001", 129),
                _make_line_item(2, "Almond Milk", "receipt-001", 399),
                _make_line_item(3, "Large Eggs", "receipt-001", 499),
                _make_line_item(4, "Zagreus XYZ Widget Unknown", "receipt-001", 999),
                _make_line_item(5, "Zyxwvuts Gibberish Product", "receipt-001", 199),
            ]
        )

        observations = map_receipt_to_observations(receipt, matcher)

        assert len(observations) == 3

    def test_all_observations_have_ocr_source_tier(self, tmp_path: Path) -> None:
        """All returned observations have source_tier='ocr'."""
        banana = _make_product("prod-1", "Organic Bananas")
        matcher = _build_matcher_with_products(tmp_path, [banana])

        receipt = _make_receipt(
            [_make_line_item(1, "Organic Bananas", "receipt-001", 129)]
        )

        observations = map_receipt_to_observations(receipt, matcher)

        assert len(observations) == 1
        assert observations[0].source_tier == "ocr"

    def test_retailer_override(self, tmp_path: Path) -> None:
        """Explicit retailer param overrides receipt.retailer_guess."""
        banana = _make_product("prod-1", "Organic Bananas")
        matcher = _build_matcher_with_products(tmp_path, [banana])

        receipt = _make_receipt(
            [_make_line_item(1, "Organic Bananas", "receipt-001", 129)]
        )

        observations = map_receipt_to_observations(
            receipt, matcher, retailer="Kroger"
        )

        assert observations[0].retailer == "Kroger"

    def test_store_location_id_override(self, tmp_path: Path) -> None:
        """Explicit store_location_id overrides receipt.store_location_id."""
        banana = _make_product("prod-1", "Organic Bananas")
        matcher = _build_matcher_with_products(tmp_path, [banana])

        receipt = _make_receipt(
            [_make_line_item(1, "Organic Bananas", "receipt-001", 129)]
        )

        observations = map_receipt_to_observations(
            receipt, matcher, store_location_id="loc-override-42"
        )

        assert observations[0].store_location_id == "loc-override-42"

    def test_price_cents_preserved(self, tmp_path: Path) -> None:
        """price_cents from the line item is carried through to the observation."""
        banana = _make_product("prod-1", "Organic Bananas")
        matcher = _build_matcher_with_products(tmp_path, [banana])

        receipt = _make_receipt(
            [_make_line_item(1, "Organic Bananas", "receipt-001", 249)]
        )

        observations = map_receipt_to_observations(receipt, matcher)

        assert observations[0].price_cents == 249

    def test_empty_receipt_returns_empty_list(self, tmp_path: Path) -> None:
        """A receipt with no line items returns an empty list."""
        banana = _make_product("prod-1", "Organic Bananas")
        matcher = _build_matcher_with_products(tmp_path, [banana])

        receipt = _make_receipt([])
        observations = map_receipt_to_observations(receipt, matcher)

        assert observations == []
