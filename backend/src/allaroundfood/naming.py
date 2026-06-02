"""Name normalization for ingredient and grocery-item matching."""

from __future__ import annotations

import re

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_name(raw: str) -> str:
    """Normalize an ingredient or item name for consistent matching.

    Lowercases, strips surrounding whitespace, and collapses internal
    whitespace runs to a single space. Names are stored already normalized
    so that pantry/shopping matching is plain string equality.

    Args:
        raw: The raw name string.

    Returns:
        The normalized name.
    """
    return _WHITESPACE_RE.sub(" ", raw.strip().lower())
