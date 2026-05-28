"""Receipt parser: drives Qwen2-VL to produce structured Receipt objects.

All LLM interaction is via QwenVLClient or FakeQwenVLClient from qwen_loader.
No llama_cpp is imported here.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from allaroundfood.ocr._prompts import build_parse_messages
from allaroundfood.ocr.models import Receipt, ReceiptLineItem
from allaroundfood.ocr.preprocess import PreprocessedReceipt
from allaroundfood.ocr.qwen_loader import (
    FakeQwenVLClient,
    QwenVLClient,
    encode_image_to_data_url,
)

logger = logging.getLogger(__name__)

_AnyQwenClient = QwenVLClient | FakeQwenVLClient


class ReceiptParseError(RuntimeError):
    """Raised when the LLM response cannot be parsed as valid JSON.

    The raw model output is stored on the exception for debugging.

    Attributes:
        raw_output: The string returned by the LLM that failed to parse.
    """

    def __init__(self, message: str, raw_output: str) -> None:
        super().__init__(message)
        self.raw_output = raw_output


def _build_line_items(
    raw_items: list[dict[str, Any]], receipt_id: str
) -> list[ReceiptLineItem]:
    """Convert raw LLM line-item dicts into ReceiptLineItem objects.

    Args:
        raw_items: List of dicts from the parsed LLM JSON.
        receipt_id: Parent receipt ID to stamp on each item.

    Returns:
        List of ReceiptLineItem objects.
    """
    items: list[ReceiptLineItem] = []
    for raw in raw_items:
        items.append(
            ReceiptLineItem(
                id=str(uuid.uuid4()),
                receipt_id=receipt_id,
                line_no=int(raw.get("line_no", 0)),
                raw_text=str(raw.get("raw_text", "")),
                parsed_name=str(raw.get("parsed_name", "")),
                parsed_qty=_float_or_none(raw.get("parsed_qty")),
                parsed_unit=_str_or_none(raw.get("parsed_unit")),
                price_cents=int(raw.get("price_cents", 0)),
            )
        )
    return items


def _float_or_none(val: object) -> float | None:
    if val is None:
        return None
    try:
        return float(val)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _str_or_none(val: object) -> str | None:
    if val is None or val == "":
        return None
    return str(val)


def _parse_datetime_or_none(val: object) -> datetime | None:
    if not val or not isinstance(val, str):
        return None
    try:
        return datetime.fromisoformat(val)
    except ValueError:
        return None


class ReceiptParser:
    """Parse a preprocessed receipt into a structured Receipt object.

    Args:
        qwen: Qwen2-VL client (real or fake).
        model_name: Model identifier string stored on the Receipt.
    """

    def __init__(
        self,
        qwen: _AnyQwenClient,
        *,
        model_name: str = "qwen2-vl",
    ) -> None:
        self._qwen = qwen
        self._model_name = model_name

    def parse(self, preprocessed: PreprocessedReceipt) -> Receipt:
        """Parse a preprocessed receipt into a Receipt object.

        Args:
            preprocessed: Output from preprocess_receipt().

        Returns:
            A frozen Receipt with all line items populated.

        Raises:
            ReceiptParseError: If the LLM returns invalid JSON.
        """
        data_urls = [
            encode_image_to_data_url(p) for p in preprocessed.page_images
        ]
        messages = build_parse_messages(data_urls)

        raw_output = self._qwen.chat(messages)

        try:
            parsed = json.loads(raw_output)
        except json.JSONDecodeError as exc:
            raise ReceiptParseError(
                f"LLM returned invalid JSON: {exc}",
                raw_output=raw_output,
            ) from exc

        receipt_id = str(uuid.uuid4())
        now = datetime.now(UTC)

        raw_items: list[dict[str, Any]] = parsed.get("line_items", [])
        line_items = _build_line_items(raw_items, receipt_id)

        return Receipt(
            id=receipt_id,
            image_path=str(preprocessed.original_path),
            retailer_guess=_str_or_none(parsed.get("retailer_guess")),
            store_location_id=None,
            purchased_at=_parse_datetime_or_none(parsed.get("purchased_at")),
            subtotal_cents=_int_or_none(parsed.get("subtotal_cents")),
            tax_cents=_int_or_none(parsed.get("tax_cents")),
            total_cents=_int_or_none(parsed.get("total_cents")),
            raw_text=raw_output,
            parser_engine="qwen-vl",
            llm_model=self._model_name,
            parse_confidence=float(parsed.get("parse_confidence", 0.0)),
            created_at=now,
            line_items=line_items,
        )


def _int_or_none(val: object) -> int | None:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    if isinstance(val, str):
        try:
            return int(val)
        except ValueError:
            return None
    return None
