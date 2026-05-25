"""Parametrized kill-switch sweep across all unofficial adapters.

Confirms that ALL four unofficial adapters raise UnofficialIngestionDisabledError
on instantiation when DISABLE_UNOFFICIAL_INGESTION=true, and that the official
Kroger adapter is unaffected (it has no kill-switch).
"""

from __future__ import annotations

from typing import Any

import pytest

from allaroundfood.pricing.adapters._guard import UnofficialIngestionDisabledError
from allaroundfood.pricing.adapters.costco import CostcoAdapter
from allaroundfood.pricing.adapters.instacart import InstacartAdapter
from allaroundfood.pricing.adapters.kroger import KrogerAdapter
from allaroundfood.pricing.adapters.walmart import WalmartAdapter
from allaroundfood.pricing.adapters.whole_foods import WholeFoodsAdapter

# ---------------------------------------------------------------------------
# Unofficial adapters — must raise when kill-switch is enabled
# ---------------------------------------------------------------------------

_UNOFFICIAL_ADAPTERS: list[tuple[str, type[Any]]] = [
    ("walmart", WalmartAdapter),
    ("costco", CostcoAdapter),
    ("whole_foods", WholeFoodsAdapter),
    ("instacart", InstacartAdapter),
]


@pytest.mark.parametrize(
    "adapter_name,adapter_cls",
    _UNOFFICIAL_ADAPTERS,
    ids=[name for name, _ in _UNOFFICIAL_ADAPTERS],
)
def test_unofficial_adapter_raises_when_kill_switch_enabled(
    monkeypatch: pytest.MonkeyPatch,
    adapter_name: str,
    adapter_cls: type[Any],
) -> None:
    """Every unofficial adapter must raise UnofficialIngestionDisabledError when env=true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    with pytest.raises(UnofficialIngestionDisabledError) as exc_info:
        adapter_cls()
    assert "DISABLE_UNOFFICIAL_INGESTION" in str(exc_info.value), (
        f"{adapter_name}: error message should mention the env var name"
    )


@pytest.mark.parametrize(
    "adapter_name,adapter_cls",
    _UNOFFICIAL_ADAPTERS,
    ids=[name for name, _ in _UNOFFICIAL_ADAPTERS],
)
def test_unofficial_adapter_instantiates_when_kill_switch_disabled(
    monkeypatch: pytest.MonkeyPatch,
    adapter_name: str,
    adapter_cls: type[Any],
) -> None:
    """Every unofficial adapter must instantiate normally when env is unset."""
    monkeypatch.delenv("DISABLE_UNOFFICIAL_INGESTION", raising=False)
    adapter = adapter_cls()
    assert adapter is not None, f"{adapter_name}: expected adapter instance, got None"


# ---------------------------------------------------------------------------
# Official Kroger adapter — must NOT have the kill-switch
# ---------------------------------------------------------------------------


def test_kroger_adapter_not_gated_by_kill_switch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """KrogerAdapter must instantiate even when the kill-switch env var is set to true."""
    monkeypatch.setenv("DISABLE_UNOFFICIAL_INGESTION", "true")
    # Should not raise — Kroger is an official adapter
    adapter = KrogerAdapter(client_id="test-id", client_secret="test-secret")
    assert adapter is not None
