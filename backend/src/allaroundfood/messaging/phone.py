"""Phone-number normalization — the validation boundary before ``osascript``.

User input never reaches the AppleScript layer unsanitized: a number must
reduce to an optional leading ``+`` followed by 7–15 digits, or it is rejected.
"""

from __future__ import annotations

import re

_DIGITS = re.compile(r"\d")
_MIN_DIGITS = 7
_MAX_DIGITS = 15  # E.164 maximum.


def normalize_phone(raw: str) -> str:
    """Normalize a phone number to ``[+]<digits>`` form.

    Strips spaces, dashes, dots, and parentheses. Keeps a single leading ``+``
    if present. Any other character (letters, shell metacharacters, etc.) makes
    the number invalid.

    Args:
        raw: The raw phone string from user input.

    Returns:
        The normalized number, e.g. ``"+15551234567"`` or ``"5551234567"``.

    Raises:
        ValueError: If the input is empty, contains disallowed characters, or
            has a digit count outside the 7–15 range.
    """
    text = raw.strip()
    if not text:
        raise ValueError("Phone number is required.")

    has_plus = text.startswith("+")
    body = text[1:] if has_plus else text

    # Allow only digits and common separators in the body; reject everything
    # else (letters, ';', '"', '&', etc.) before it can reach osascript.
    if not re.fullmatch(r"[\d\s().\-]*", body):
        raise ValueError("Phone number contains invalid characters.")

    digits = "".join(_DIGITS.findall(body))
    if not (_MIN_DIGITS <= len(digits) <= _MAX_DIGITS):
        raise ValueError(
            f"Phone number must have {_MIN_DIGITS}–{_MAX_DIGITS} digits."
        )

    return f"+{digits}" if has_plus else digits
