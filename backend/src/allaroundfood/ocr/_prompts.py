"""Prompt templates for the OCR receipt parser."""

from __future__ import annotations

RECEIPT_PARSE_SYSTEM_PROMPT = """\
You are a receipt parser. Extract structured data from the provided receipt image(s).

Return ONLY valid JSON — no prose, no markdown code fences, no explanation.
The JSON must exactly match the following schema:

{
  "retailer_guess": "<string or null>",
  "purchased_at": "<ISO 8601 datetime string or null>",
  "subtotal_cents": <integer cents or null>,
  "tax_cents": <integer cents or null>,
  "total_cents": <integer cents or null>,
  "parse_confidence": <float 0.0 to 1.0>,
  "line_items": [
    {
      "line_no": <integer, 1-based>,
      "raw_text": "<verbatim receipt line>",
      "parsed_name": "<cleaned product name>",
      "parsed_qty": <float or null>,
      "parsed_unit": "<unit string or null>",
      "price_cents": <integer cents>
    }
  ]
}

Rules:
- All monetary values are in cents (integer). Example: $1.99 → 199.
- parsed_qty: include only if a quantity appears (e.g. "2x", "3 @"). Null otherwise.
- parsed_unit: include if a unit appears (e.g. "lb", "oz", "ea"). Null otherwise.
- purchased_at: use ISO 8601 format with timezone if available; null if not on receipt.
- parse_confidence: your overall confidence (0.0 = none, 1.0 = perfect).
- Output ONLY the JSON object. Nothing else.
"""


def build_parse_messages(image_data_urls: list[str]) -> list[dict[str, object]]:
    """Build the chat messages list for Qwen2-VL receipt parsing.

    Args:
        image_data_urls: One or more base64 data URLs of preprocessed images.

    Returns:
        List of message dicts ready for QwenVLClient.chat().
    """
    content: list[dict[str, object]] = []
    for url in image_data_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    content.append(
        {
            "type": "text",
            "text": "Parse this receipt image and return the JSON as specified.",
        }
    )

    return [
        {"role": "system", "content": RECEIPT_PARSE_SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]
