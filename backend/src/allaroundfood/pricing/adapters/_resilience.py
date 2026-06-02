"""Shared resilience helpers for retailer adapters."""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, ParamSpec, TypeVar

import httpx
from tenacity import RetryCallState, retry, retry_if_exception, stop_after_attempt
from tenacity.wait import wait_base, wait_exponential

_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_COUNTERS: Counter[tuple[str, str, str]] = Counter()
_P = ParamSpec("_P")
_T = TypeVar("_T")


def reset_adapter_counters() -> None:
    """Reset all in-memory adapter resilience counters."""
    _COUNTERS.clear()


def adapter_counter_snapshot() -> dict[str, dict[str, dict[str, int]]]:
    """Return a nested snapshot of adapter resilience counters."""
    snapshot: dict[str, dict[str, dict[str, int]]] = {}
    for (adapter, operation, event), value in _COUNTERS.items():
        snapshot.setdefault(adapter, {}).setdefault(operation, {})[event] = value
    return snapshot


def record_adapter_event(adapter: str, operation: str, event: str) -> None:
    """Increment one adapter resilience counter."""
    _COUNTERS[(adapter, operation, event)] += 1


def log_adapter_event(
    logger: logging.Logger,
    adapter: str,
    operation: str,
    event: str,
    *,
    level: int = logging.INFO,
    **details: Any,
) -> None:
    """Emit a structured adapter log record."""
    logger.log(
        level,
        "adapter_event",
        extra={
            "adapter_name": adapter,
            "adapter_operation": operation,
            "adapter_event": event,
            **details,
        },
    )


def is_retryable_http_exception(exc: BaseException) -> bool:
    """Return True if an HTTP exception should be retried."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    return False


def http_status_code(exc: BaseException) -> int | None:
    """Extract the HTTP status code from an exception when available."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code
    return None


def record_json_failure(
    logger: logging.Logger,
    adapter: str,
    operation: str,
    exc: BaseException,
) -> None:
    """Audit a failed JSON path attempt after retries are exhausted."""
    status_code = http_status_code(exc)
    record_adapter_event(adapter, operation, "json_failure")
    if status_code == 429:
        record_adapter_event(adapter, operation, "rate_limit")
    log_adapter_event(
        logger,
        adapter,
        operation,
        "json_failure",
        level=logging.WARNING,
        status_code=status_code,
        error_type=type(exc).__name__,
    )


def record_json_success(
    logger: logging.Logger,
    adapter: str,
    operation: str,
    *,
    result_count: int,
) -> None:
    """Audit a successful JSON path response."""
    record_adapter_event(adapter, operation, "json_success")
    log_adapter_event(
        logger,
        adapter,
        operation,
        "json_success",
        result_count=result_count,
    )


def record_fallback_attempt(
    logger: logging.Logger,
    adapter: str,
    operation: str,
    exc: BaseException,
) -> None:
    """Audit a browser fallback attempt."""
    record_adapter_event(adapter, operation, "fallback_attempt")
    log_adapter_event(
        logger,
        adapter,
        operation,
        "fallback_attempt",
        level=logging.WARNING,
        status_code=http_status_code(exc),
        error_type=type(exc).__name__,
    )


def record_fallback_result(
    logger: logging.Logger,
    adapter: str,
    operation: str,
    event: str,
    *,
    result_count: int | None = None,
    exc: BaseException | None = None,
) -> None:
    """Audit a browser fallback success or failure."""
    record_adapter_event(adapter, operation, event)
    log_adapter_event(
        logger,
        adapter,
        operation,
        event,
        level=logging.WARNING if event == "fallback_failure" else logging.INFO,
        result_count=result_count,
        error_type=type(exc).__name__ if exc else None,
    )


def retry_json(
    adapter: str,
    operation: str,
    logger: logging.Logger,
) -> Callable[[Callable[_P, Awaitable[_T]]], Callable[_P, Awaitable[_T]]]:
    """Build a Retry-After-aware tenacity decorator for JSON endpoints."""
    decorator = retry(
        retry=retry_if_exception(is_retryable_http_exception),
        stop=stop_after_attempt(3),
        wait=wait_retry_after_or_exponential(
            fallback=wait_exponential(multiplier=0.1, min=0.1, max=2),
            max_retry_after=2.0,
        ),
        before_sleep=_before_sleep(adapter, operation, logger),
        reraise=True,
    )

    def _decorator(func: Callable[_P, Awaitable[_T]]) -> Callable[_P, Awaitable[_T]]:
        return decorator(func)

    return _decorator


def _before_sleep(
    adapter: str,
    operation: str,
    logger: logging.Logger,
) -> Callable[[RetryCallState], None]:
    def _callback(retry_state: RetryCallState) -> None:
        exc = retry_state.outcome.exception() if retry_state.outcome else None
        status_code = http_status_code(exc) if exc else None
        record_adapter_event(adapter, operation, "json_retry")
        if status_code == 429:
            record_adapter_event(adapter, operation, "rate_limit")
        log_adapter_event(
            logger,
            adapter,
            operation,
            "json_retry",
            level=logging.WARNING,
            attempt=retry_state.attempt_number,
            sleep=retry_state.next_action.sleep if retry_state.next_action else None,
            status_code=status_code,
        )

    return _callback


class wait_retry_after_or_exponential(wait_base):
    """Use Retry-After for rate limits, otherwise fall back to exponential wait."""

    def __init__(self, fallback: wait_base, max_retry_after: float) -> None:
        self._fallback = fallback
        self._max_retry_after = max_retry_after

    def __call__(self, retry_state: RetryCallState) -> float:
        exc = retry_state.outcome.exception() if retry_state.outcome else None
        retry_after = _retry_after_seconds(exc)
        if retry_after is None:
            return float(self._fallback(retry_state))
        return min(retry_after, self._max_retry_after)


def _retry_after_seconds(exc: BaseException | None) -> float | None:
    if not isinstance(exc, httpx.HTTPStatusError):
        return None
    retry_after = exc.response.headers.get("Retry-After")
    if not retry_after:
        return None
    try:
        return max(float(retry_after), 0.0)
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(retry_after)
    except (TypeError, ValueError):
        return None
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=UTC)
    return max((retry_at - datetime.now(tz=UTC)).total_seconds(), 0.0)
