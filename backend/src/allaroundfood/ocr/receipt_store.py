"""Immutable Polars-backed ReceiptStore.

Mirrors the pattern used in pricing/store/*.py. Line items are stored as a
JSON-encoded string column so the Parquet schema stays flat.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import polars as pl

from allaroundfood.ocr.models import Receipt, ReceiptLineItem

logger = logging.getLogger(__name__)


def _line_items_to_json(items: list[ReceiptLineItem]) -> str:
    """Serialise line items to a JSON string for Parquet storage."""
    return json.dumps([item.model_dump(mode="json") for item in items])


def _json_to_line_items(raw: str) -> list[ReceiptLineItem]:
    """Deserialise line items from a JSON string."""
    data: list[dict[str, Any]] = json.loads(raw)
    return [ReceiptLineItem(**d) for d in data]


class ReceiptStore:
    """Immutable Polars-backed store for Receipt records.

    All mutation methods return NEW instances — self is never modified.
    Line items are stored as a JSON string column.
    """

    def __init__(self, path: Path, df: pl.DataFrame | None = None) -> None:
        """Initialise with a path and optional DataFrame.

        Args:
            path: Path to the Parquet file.
            df: Polars DataFrame. Defaults to empty schema when None.
        """
        self._path = path
        self._df = df if df is not None else self._empty_df()

    @staticmethod
    def _empty_df() -> pl.DataFrame:
        return pl.DataFrame(
            {
                "id": pl.Series([], dtype=pl.String),
                "user_id": pl.Series([], dtype=pl.String),
                "image_path": pl.Series([], dtype=pl.String),
                "retailer_guess": pl.Series([], dtype=pl.String),
                "store_location_id": pl.Series([], dtype=pl.String),
                "purchased_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "subtotal_cents": pl.Series([], dtype=pl.Int64),
                "tax_cents": pl.Series([], dtype=pl.Int64),
                "total_cents": pl.Series([], dtype=pl.Int64),
                "raw_text": pl.Series([], dtype=pl.String),
                "parser_engine": pl.Series([], dtype=pl.String),
                "llm_model": pl.Series([], dtype=pl.String),
                "parse_confidence": pl.Series([], dtype=pl.Float64),
                "created_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                "line_items_json": pl.Series([], dtype=pl.String),
            }
        )

    @classmethod
    def load(cls, path: Path) -> ReceiptStore:
        """Load from Parquet; return empty store if file missing.

        Args:
            path: Path to the Parquet file.

        Returns:
            ReceiptStore loaded from disk or empty.
        """
        if not path.exists():
            return cls(path)
        return cls(path, pl.read_parquet(path))

    def save(self) -> None:
        """Write the current DataFrame to Parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def _receipt_to_row(self, receipt: Receipt) -> pl.DataFrame:
        """Convert a Receipt to a single-row Polars DataFrame."""
        return pl.DataFrame(
            {
                "id": pl.Series([receipt.id], dtype=pl.String),
                "user_id": pl.Series([receipt.user_id], dtype=pl.String),
                "image_path": pl.Series([receipt.image_path], dtype=pl.String),
                "retailer_guess": pl.Series([receipt.retailer_guess], dtype=pl.String),
                "store_location_id": pl.Series(
                    [receipt.store_location_id], dtype=pl.String
                ),
                "purchased_at": pl.Series(
                    [receipt.purchased_at], dtype=pl.Datetime("us", "UTC")
                ),
                "subtotal_cents": pl.Series([receipt.subtotal_cents], dtype=pl.Int64),
                "tax_cents": pl.Series([receipt.tax_cents], dtype=pl.Int64),
                "total_cents": pl.Series([receipt.total_cents], dtype=pl.Int64),
                "raw_text": pl.Series([receipt.raw_text], dtype=pl.String),
                "parser_engine": pl.Series([receipt.parser_engine], dtype=pl.String),
                "llm_model": pl.Series([receipt.llm_model], dtype=pl.String),
                "parse_confidence": pl.Series(
                    [receipt.parse_confidence], dtype=pl.Float64
                ),
                "created_at": pl.Series(
                    [receipt.created_at], dtype=pl.Datetime("us", "UTC")
                ),
                "line_items_json": pl.Series(
                    [_line_items_to_json(receipt.line_items)], dtype=pl.String
                ),
            }
        )

    def _row_to_receipt(self, row: dict[str, Any]) -> Receipt:
        from datetime import datetime

        def _dt(v: Any) -> datetime | None:
            if v is None:
                return None
            return v if isinstance(v, datetime) else datetime.fromisoformat(str(v))

        return Receipt(
            id=row["id"],
            user_id=row["user_id"],
            image_path=row["image_path"],
            retailer_guess=row["retailer_guess"],
            store_location_id=row["store_location_id"],
            purchased_at=_dt(row["purchased_at"]),
            subtotal_cents=row["subtotal_cents"],
            tax_cents=row["tax_cents"],
            total_cents=row["total_cents"],
            raw_text=row["raw_text"],
            parser_engine=row["parser_engine"],  # type: ignore[arg-type]
            llm_model=row["llm_model"],
            parse_confidence=row["parse_confidence"],
            created_at=_dt(row["created_at"]) or datetime.now(),
            line_items=_json_to_line_items(row["line_items_json"] or "[]"),
        )

    def add(self, receipt: Receipt) -> ReceiptStore:
        """Return a NEW store with receipt appended.

        Args:
            receipt: The Receipt to add.

        Returns:
            New ReceiptStore with the receipt added.
        """
        new_row = self._receipt_to_row(receipt)
        return ReceiptStore(self._path, pl.concat([self._df, new_row]))

    def update(self, receipt_id: str, receipt: Receipt) -> ReceiptStore:
        """Return a NEW store with the matching row replaced.

        Args:
            receipt_id: The ID of the receipt to replace.
            receipt: The updated Receipt.

        Returns:
            New ReceiptStore with the receipt updated.

        Raises:
            KeyError: If no receipt with receipt_id is found.
        """
        if self.get(receipt_id) is None:
            raise KeyError(receipt_id)
        new_df = self._df.filter(pl.col("id") != receipt_id)
        new_row = self._receipt_to_row(receipt)
        return ReceiptStore(self._path, pl.concat([new_df, new_row]))

    def all(self) -> list[Receipt]:
        """Return all stored receipts.

        Returns:
            List of Receipt objects.
        """
        return [self._row_to_receipt(r) for r in self._df.iter_rows(named=True)]

    def get(self, receipt_id: str) -> Receipt | None:
        """Retrieve a Receipt by ID, or None if not found.

        Args:
            receipt_id: The ID to look up.

        Returns:
            Receipt if found, else None.
        """
        for row in self._df.iter_rows(named=True):
            if row["id"] == receipt_id:
                return self._row_to_receipt(row)
        return None
