"""Map a parsed Receipt to PriceObservation rows via the CanonicalMatcher.

This module is the bridge between the OCR pipeline and the pricing domain.
It produces immutable PriceObservation records and does NOT write to any store.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime

from allaroundfood.ocr.models import Receipt, ReceiptLineItem
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher, MatchQuery
from allaroundfood.pricing.models import PriceObservation

logger = logging.getLogger(__name__)


def _sha256_hex(text: str) -> str:
    """Return the hex SHA-256 digest of a UTF-8 string."""
    return hashlib.sha256(text.encode()).hexdigest()


def map_receipt_to_observations(
    receipt: Receipt,
    matcher: CanonicalMatcher,
    *,
    store_location_id: str | None = None,
    retailer: str | None = None,
) -> list[PriceObservation]:
    """Map a Receipt's line items to PriceObservation rows.

    Each matched line item becomes one PriceObservation. Unmatched items are
    logged at WARNING level and skipped.

    Args:
        receipt: The parsed receipt to map.
        matcher: CanonicalMatcher used to resolve product identities.
        store_location_id: Override for store_location_id; falls back to
            receipt.store_location_id, then ``"unknown"``.
        retailer: Override for retailer name; falls back to
            receipt.retailer_guess, then ``"unknown"``.

    Returns:
        List of PriceObservation objects (one per matched line item).
    """
    resolved_retailer = retailer or receipt.retailer_guess or "unknown"
    resolved_store_id = store_location_id or receipt.store_location_id or "unknown"
    observed_at: datetime = receipt.purchased_at or receipt.created_at

    observations: list[PriceObservation] = []

    for line in receipt.line_items:
        query = MatchQuery(
            name=line.parsed_name,
            brand=None,
            size_raw=line.parsed_unit,
            gtin=None,
        )

        result = matcher.match(query)
        if result is None:
            logger.warning(
                "No canonical match for line %d '%s' on receipt %s — skipping",
                line.line_no,
                line.parsed_name,
                receipt.id,
            )
            continue

        obs = PriceObservation(
            id=str(uuid.uuid4()),
            retailer=resolved_retailer,
            store_location_id=resolved_store_id,
            retailer_sku_id="ocr-unknown",
            canonical_product_id=result.canonical_product.id,
            price_cents=line.price_cents,
            unit_price_cents=None,
            was_on_promo=False,
            promo_text=None,
            promo_price_cents=None,
            currency="USD",
            observed_at=observed_at,
            source_tier="ocr",
            raw_response_hash=_sha256_hex(line.raw_text),
        )
        observations.append(obs)

    return observations
