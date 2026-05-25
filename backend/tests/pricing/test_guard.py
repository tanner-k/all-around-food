"""Tests for the unofficial-ingestion kill-switch guard."""

from __future__ import annotations

import pytest

from allaroundfood.pricing.adapters._guard import (
    UnofficialIngestionDisabledError,
    unofficial_only,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _SampleAdapter:
    """Minimal adapter-like class for testing the decorator."""

    @unofficial_only
    def __init__(self, value: int = 42) -> None:
        self.value = value


# ---------------------------------------------------------------------------
# Guard disabled (default / false)
# ---------------------------------------------------------------------------


def test_guard_allows_when_env_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Adapter instantiates normally when env var is absent."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = _SampleAdapter(value=7)
    assert adapter.value == 7


def test_guard_allows_when_env_is_false(monkeypatch: pytest.MonkeyPatch) -> None:
    """Adapter instantiates normally when env var is explicitly 'false'."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "false")
    adapter = _SampleAdapter(value=99)
    assert adapter.value == 99


# ---------------------------------------------------------------------------
# Guard enabled (true)
# ---------------------------------------------------------------------------


def test_guard_raises_when_env_is_true(monkeypatch: pytest.MonkeyPatch) -> None:
    """Adapter raises UnofficialIngestionDisabledError when kill-switch is on."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError) as exc_info:
        _SampleAdapter()
    assert "DISABLE_UNOFFICIAL_INGESTION" in str(exc_info.value)


def test_guard_raises_is_runtime_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """UnofficialIngestionDisabledError is a subclass of RuntimeError."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(RuntimeError):
        _SampleAdapter()


def test_guard_message_mentions_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    """Error message must reference the env var name so operators know how to fix it."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError, match="DISABLE_UNOFFICIAL_INGESTION"):
        _SampleAdapter()


# ---------------------------------------------------------------------------
# Decorator preserves wrapped function metadata
# ---------------------------------------------------------------------------


def test_decorator_preserves_name() -> None:
    """@unofficial_only must not clobber __name__ / __doc__ of the wrapped function."""
    assert _SampleAdapter.__init__.__name__ == "__init__"
