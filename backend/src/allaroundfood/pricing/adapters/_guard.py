"""Kill-switch guard for unofficial scraping adapters.

Decorators and errors used to gate non-official adapters behind the
``DISABLE_UNOFFICIAL_INGESTION`` environment variable.

Usage::

    from allaroundfood.pricing.adapters._guard import unofficial_only

    class MyAdapter:
        @unofficial_only
        def __init__(self) -> None:
            ...

If ``DISABLE_UNOFFICIAL_INGESTION=true`` is set, the decorated ``__init__``
(or any other decorated callable) raises ``UnofficialIngestionDisabledError``
immediately — before any network activity occurs.
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any, TypeVar

from allaroundfood.config import Settings

F = TypeVar("F", bound=Callable[..., Any])


class UnofficialIngestionDisabledError(RuntimeError):
    """Raised when an unofficial adapter is instantiated while the kill-switch is active.

    Set ``DISABLE_UNOFFICIAL_INGESTION=false`` (or unset it entirely) to re-enable
    unofficial scraping adapters.
    """


def unofficial_only(fn: F) -> F:
    """Decorator that raises ``UnofficialIngestionDisabledError`` when the kill-switch is on.

    Apply to an adapter's ``__init__`` method.  The check runs once, at
    instantiation time, so any subsequent method calls are unguarded (the guard
    is enforced per-instance-creation, not per-request).

    Args:
        fn: The callable to wrap (typically ``__init__``).

    Returns:
        The wrapped callable.

    Raises:
        UnofficialIngestionDisabledError: If ``Settings().disable_unofficial_ingestion``
            is ``True`` at call time.
    """

    @functools.wraps(fn)
    def _wrapper(*args: Any, **kwargs: Any) -> Any:
        settings = Settings()
        if settings.disable_unofficial_ingestion:
            raise UnofficialIngestionDisabledError(
                "Unofficial scraping adapters are disabled. "
                "Set DISABLE_UNOFFICIAL_INGESTION=false (or unset it) to enable them."
            )
        return fn(*args, **kwargs)

    return _wrapper  # type: ignore[return-value]
