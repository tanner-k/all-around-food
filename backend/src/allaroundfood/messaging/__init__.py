"""Outbound messaging: format a shopping list and send it via Apple Messages.

Sending is macOS-only — it drives Messages.app through ``osascript``. On any
other platform :func:`send_imessage` raises :class:`MessagingError`.
"""

from __future__ import annotations

from allaroundfood.messaging.formatter import format_shopping_list
from allaroundfood.messaging.imessage import MessagingError, send_imessage
from allaroundfood.messaging.phone import normalize_phone

__all__ = [
    "MessagingError",
    "format_shopping_list",
    "normalize_phone",
    "send_imessage",
]
