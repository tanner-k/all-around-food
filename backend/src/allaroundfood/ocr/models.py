"""Pydantic v2 models for the OCR receipt pipeline.

These models are independent of any pantry receipt-import flow. They map
directly from LLM-structured output to pricing domain objects.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ReceiptLineItem(BaseModel):
    """A single line item parsed from a receipt.

    Attributes:
        id: Unique identifier for this line item.
        receipt_id: ID of the parent receipt.
        line_no: 1-based line number within the receipt.
        raw_text: Verbatim text from the receipt line.
        parsed_name: Cleaned product name extracted by the LLM.
        parsed_qty: Quantity (e.g. 2.0 for "2x"), or None if absent.
        parsed_unit: Unit string (e.g. "lb", "oz"), or None if absent.
        price_cents: Item total price in cents.
        matched_canonical_product_id: Set after canonical matching.
        match_confidence: Confidence score from canonical matching (0–1).
    """

    model_config = ConfigDict(frozen=True)

    id: str
    receipt_id: str
    line_no: int
    raw_text: str
    parsed_name: str
    parsed_qty: float | None
    parsed_unit: str | None
    price_cents: int
    matched_canonical_product_id: str | None = None
    match_confidence: float | None = None


class Receipt(BaseModel):
    """A parsed receipt with all line items and metadata.

    Attributes:
        id: Unique receipt identifier.
        user_id: Forward-compat field; currently always None (single-tenant).
        image_path: Path to the original receipt image on disk.
        retailer_guess: Retailer name guessed by the LLM, or None.
        store_location_id: Resolved store location ID, or None.
        purchased_at: Timestamp of purchase, or None if not detected.
        subtotal_cents: Subtotal before tax, or None.
        tax_cents: Tax amount in cents, or None.
        total_cents: Total amount in cents, or None.
        raw_text: Full raw text from the LLM response (pre-parse).
        parser_engine: Always ``"qwen-vl"`` for this pipeline.
        llm_model: Model identifier string (e.g. ``"qwen2-vl"``).
        parse_confidence: Overall LLM confidence, 0.0–1.0.
        created_at: Timestamp when the receipt was processed.
        line_items: Parsed line items.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    user_id: str | None = None
    image_path: str  # stored as str so Parquet serializes cleanly
    retailer_guess: str | None
    store_location_id: str | None
    purchased_at: datetime | None
    subtotal_cents: int | None
    tax_cents: int | None
    total_cents: int | None
    raw_text: str
    parser_engine: Literal["qwen-vl"]
    llm_model: str
    parse_confidence: float
    created_at: datetime
    line_items: list[ReceiptLineItem] = []
