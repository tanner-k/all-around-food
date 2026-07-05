"""Tests for the messaging package: phone validation, formatting, iMessage send."""

from __future__ import annotations

import subprocess
from typing import Any

import pytest

from allaroundfood.messaging.formatter import format_shopping_list
from allaroundfood.messaging.imessage import MessagingError, send_imessage
from allaroundfood.messaging.phone import normalize_phone
from allaroundfood.models import ShoppingListItem


def _item(name: str, aisle: str, **kw: Any) -> ShoppingListItem:
    return ShoppingListItem(id=name, name=name, aisle=aisle, **kw)  # type: ignore[arg-type]


# ── phone ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+1 (555) 123-4567", "+15551234567"),
        ("555-123-4567", "5551234567"),
        ("  555.123.4567  ", "5551234567"),
        ("+44 7911 123456", "+447911123456"),
    ],
)
def test_normalize_phone_valid(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "abc",
        "123",  # too short
        "12345678901234567",  # too long
        "555-CALL-NOW",
        "+",
        "; rm -rf /",
        '" & do shell script "evil',
    ],
)
def test_normalize_phone_invalid(raw: str) -> None:
    with pytest.raises(ValueError):
        normalize_phone(raw)


# ── formatter ──────────────────────────────────────────────────────────────


def test_format_groups_by_aisle_with_header() -> None:
    items = [
        _item("apples", "Produce", quantity_text="3"),
        _item("spinach", "Produce"),
        _item("milk", "Dairy", quantity_text="1 gal"),
    ]
    text = format_shopping_list(items)
    assert "Shopping list" in text
    assert "3 items" in text
    # Aisle headers present and ordered Produce before Dairy.
    assert text.index("Produce") < text.index("Dairy")
    assert "apples (3)" in text
    assert "spinach" in text
    assert "milk (1 gal)" in text


def test_format_skips_checked_items() -> None:
    items = [
        _item("apples", "Produce"),
        _item("milk", "Dairy", checked=True),
    ]
    text = format_shopping_list(items)
    assert "apples" in text
    assert "milk" not in text


def test_format_empty_returns_empty_string() -> None:
    assert format_shopping_list([]) == ""
    assert format_shopping_list([_item("milk", "Dairy", checked=True)]) == ""


# ── imessage ───────────────────────────────────────────────────────────────


def test_send_imessage_passes_args_not_shell_string(monkeypatch: Any) -> None:
    calls: dict[str, Any] = {}

    def fake_run(cmd: list[str], **kwargs: Any) -> Any:
        calls["cmd"] = cmd
        calls["kwargs"] = kwargs

        class R:
            returncode = 0
            stderr = ""

        return R()

    monkeypatch.setattr("allaroundfood.messaging.imessage.platform.system", lambda: "Darwin")
    monkeypatch.setattr(subprocess, "run", fake_run)

    send_imessage("+15551234567", "buy milk")

    cmd = calls["cmd"]
    assert cmd[0] == "osascript"
    # Recipient and body must be passed as discrete argv entries, never
    # interpolated into the AppleScript source.
    assert "+15551234567" in cmd
    assert "buy milk" in cmd
    assert calls["kwargs"].get("shell") in (None, False)


def test_send_imessage_raises_on_non_darwin(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        "allaroundfood.messaging.imessage.platform.system", lambda: "Linux"
    )
    with pytest.raises(MessagingError):
        send_imessage("+15551234567", "hi")


def test_send_imessage_raises_on_osascript_failure(monkeypatch: Any) -> None:
    def fake_run(cmd: list[str], **kwargs: Any) -> Any:
        class R:
            returncode = 1
            stderr = "Messages got an error"

        return R()

    monkeypatch.setattr(
        "allaroundfood.messaging.imessage.platform.system", lambda: "Darwin"
    )
    monkeypatch.setattr(subprocess, "run", fake_run)

    with pytest.raises(MessagingError):
        send_imessage("+15551234567", "hi")
