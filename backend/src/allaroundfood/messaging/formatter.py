"""Render a shopping list as plain text suitable for a text message."""

from __future__ import annotations

from allaroundfood.aisles import AISLE_ORDER
from allaroundfood.models import ShoppingListItem


def format_shopping_list(items: list[ShoppingListItem]) -> str:
    """Format unchecked shopping-list items as aisle-grouped plain text.

    Checked items are omitted (they are already in the cart). Items are grouped
    under their aisle in ``AISLE_ORDER`` and sorted by name within each group.
    A ``quantity_text`` is appended in parentheses when present.

    Args:
        items: All shopping-list items.

    Returns:
        A multi-line message, or an empty string if no unchecked items remain.
    """
    pending = [item for item in items if not item.checked]
    if not pending:
        return ""

    count = len(pending)
    noun = "item" if count == 1 else "items"
    lines = [f"🛒 Shopping list — {count} {noun}", ""]

    for aisle in AISLE_ORDER:
        group = sorted(
            (item for item in pending if item.aisle == aisle),
            key=lambda item: item.name.lower(),
        )
        if not group:
            continue
        lines.append(aisle)
        for item in group:
            qty = f" ({item.quantity_text})" if item.quantity_text else ""
            lines.append(f"• {item.name}{qty}")
        lines.append("")

    return "\n".join(lines).rstrip()
