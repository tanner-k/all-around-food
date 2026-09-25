"""FastAPI router for the OCR receipt pipeline.

Mounted at /receipts. Uses dependency injection for all stores and the
parser so tests can substitute fakes via app.dependency_overrides.
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict

from allaroundfood.ocr.api.deps import (
    get_canonical_matcher,
    get_observation_store,
    get_receipt_image_dir,
    get_receipt_parser,
    get_receipt_store,
)
from allaroundfood.ocr.models import Receipt
from allaroundfood.ocr.parser import ReceiptParseError, ReceiptParser
from allaroundfood.ocr.preprocess import preprocess_receipt
from allaroundfood.ocr.receipt_store import ReceiptStore
from allaroundfood.ocr.to_observations import map_receipt_to_observations
from allaroundfood.pricing.api.envelope import ApiResponse
from allaroundfood.pricing.canonical.matcher import CanonicalMatcher
from allaroundfood.pricing.store.price_observation_store import PriceObservationStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/receipts", tags=["receipts"])


class ObservationSummary(BaseModel):
    """Slim summary of a PriceObservation for the parse response."""

    model_config = ConfigDict(frozen=True)

    observation_id: str
    retailer: str
    canonical_product_id: str
    price_cents: int


class ReceiptParseResponse(BaseModel):
    """Response body for POST /receipts/parse."""

    model_config = ConfigDict(frozen=True)

    receipt: Receipt
    observations: list[ObservationSummary]


_SUPPORTED_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
}


@router.post("/parse", response_model=ApiResponse[ReceiptParseResponse])
async def post_parse_receipt(
    image: UploadFile,
    retailer: str | None = Form(default=None),
    store_location_id: str | None = Form(default=None),
    parser: ReceiptParser = Depends(get_receipt_parser),
    matcher: CanonicalMatcher = Depends(get_canonical_matcher),
    receipt_store: ReceiptStore = Depends(get_receipt_store),
    obs_store: PriceObservationStore = Depends(get_observation_store),
    receipt_image_dir: Path = Depends(get_receipt_image_dir),
) -> ApiResponse[ReceiptParseResponse]:
    """Parse a receipt image/PDF and emit PriceObservation rows.

    Multipart form fields:
    - ``image``: The receipt file (JPEG, PNG, or PDF).
    - ``retailer`` (optional): Retailer name override.
    - ``store_location_id`` (optional): Store location ID override.

    Returns:
        ApiResponse containing the parsed Receipt and a summary of matched
        PriceObservation rows.

    Raises:
        HTTPException 400: Unsupported content type or preprocessing failure.
        HTTPException 422: LLM returned unparseable JSON.
    """
    content_type = image.content_type or ""
    if content_type not in _SUPPORTED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type '{content_type}'. "
            f"Supported: {sorted(_SUPPORTED_MIMES)}",
        )

    # Determine extension from content type for temp file naming
    ext_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "application/pdf": ".pdf",
    }
    ext = ext_map.get(content_type, ".bin")

    receipt_image_dir.mkdir(parents=True, exist_ok=True)
    upload_path = receipt_image_dir / f"{uuid.uuid4()}{ext}"
    contents = await image.read()
    upload_path.write_bytes(contents)

    with tempfile.TemporaryDirectory(prefix="ocr_upload_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        try:
            preprocessed = preprocess_receipt(upload_path, output_dir=tmp_dir)
        except (ValueError, FileNotFoundError) as exc:
            upload_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            receipt = parser.parse(preprocessed)
        except ReceiptParseError as exc:
            upload_path.unlink(missing_ok=True)
            logger.error("OCR parse failed: %s | raw=%s", exc, exc.raw_output[:200])
            raise HTTPException(
                status_code=422,
                detail="Receipt could not be parsed — LLM returned invalid JSON.",
            ) from exc

    # Map to observations (temp dir context closed — page images no longer needed)
    observations = map_receipt_to_observations(
        receipt,
        matcher,
        store_location_id=store_location_id,
        retailer=retailer,
    )

    # Persist receipt
    updated_receipt_store = receipt_store.add(receipt)
    updated_receipt_store.save()

    # Persist observations
    updated_obs_store = obs_store
    for obs in observations:
        updated_obs_store = updated_obs_store.add(obs)
    updated_obs_store.save()

    summaries = [
        ObservationSummary(
            observation_id=obs.id,
            retailer=obs.retailer,
            canonical_product_id=obs.canonical_product_id,
            price_cents=obs.price_cents,
        )
        for obs in observations
    ]

    return ApiResponse(
        success=True,
        data=ReceiptParseResponse(receipt=receipt, observations=summaries),
    )
