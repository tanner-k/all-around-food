"""Tests for ReceiptStore (Parquet-backed immutable store)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from allaroundfood.ocr.models import Receipt, ReceiptLineItem
from allaroundfood.ocr.receipt_store import ReceiptStore


def _make_receipt(receipt_id: str = "r-001") -> Receipt:
    now = datetime.now(UTC)
    line = ReceiptLineItem(
        id="li-001",
        receipt_id=receipt_id,
        line_no=1,
        raw_text="Bananas $1.29",
        parsed_name="Bananas",
        parsed_qty=None,
        parsed_unit=None,
        price_cents=129,
    )
    return Receipt(
        id=receipt_id,
        image_path="/tmp/test.png",
        retailer_guess="Test Store",
        store_location_id="loc-001",
        purchased_at=now,
        subtotal_cents=129,
        tax_cents=10,
        total_cents=139,
        raw_text="{}",
        parser_engine="qwen-vl",
        llm_model="qwen2-vl",
        parse_confidence=0.9,
        created_at=now,
        line_items=[line],
    )


class TestReceiptStore:
    def test_empty_store_returns_no_receipts(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        assert store.all() == []

    def test_load_missing_file_returns_empty_store(self, tmp_path: Path) -> None:
        store = ReceiptStore.load(tmp_path / "nonexistent.parquet")
        assert store.all() == []

    def test_add_returns_new_store(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        receipt = _make_receipt("r-001")
        new_store = store.add(receipt)
        assert len(new_store.all()) == 1
        assert len(store.all()) == 0  # original unchanged

    def test_get_returns_receipt_by_id(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        receipt = _make_receipt("r-001")
        store = store.add(receipt)
        found = store.get("r-001")
        assert found is not None
        assert found.id == "r-001"

    def test_get_returns_none_for_missing(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        assert store.get("nonexistent") is None

    def test_parquet_roundtrip(self, tmp_path: Path) -> None:
        path = tmp_path / "receipts.parquet"
        receipt = _make_receipt("r-002")
        store = ReceiptStore(path)
        store = store.add(receipt)
        store.save()

        loaded = ReceiptStore.load(path)
        all_receipts = loaded.all()
        assert len(all_receipts) == 1
        assert all_receipts[0].id == "r-002"
        assert all_receipts[0].retailer_guess == "Test Store"
        assert len(all_receipts[0].line_items) == 1
        assert all_receipts[0].line_items[0].parsed_name == "Bananas"

    def test_update_replaces_receipt(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        receipt = _make_receipt("r-001")
        store = store.add(receipt)

        updated = receipt.model_copy(update={"retailer_guess": "Updated Store"})
        store = store.update("r-001", updated)

        found = store.get("r-001")
        assert found is not None
        assert found.retailer_guess == "Updated Store"

    def test_update_missing_id_raises_key_error(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        receipt = _make_receipt("r-001")
        with pytest.raises(KeyError):
            store.update("nonexistent", receipt)

    def test_add_multiple_receipts(self, tmp_path: Path) -> None:
        store = ReceiptStore(tmp_path / "receipts.parquet")
        for i in range(5):
            store = store.add(_make_receipt(f"r-{i:03d}"))
        assert len(store.all()) == 5

    def test_line_items_preserved_after_roundtrip(self, tmp_path: Path) -> None:
        path = tmp_path / "receipts.parquet"
        receipt = _make_receipt("r-003")
        store = ReceiptStore(path).add(receipt)
        store.save()

        loaded = ReceiptStore.load(path)
        found = loaded.get("r-003")
        assert found is not None
        assert found.line_items[0].price_cents == 129
        assert found.line_items[0].receipt_id == "r-003"
