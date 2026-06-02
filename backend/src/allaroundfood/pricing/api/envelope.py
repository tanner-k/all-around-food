"""Generic API response envelope for pricing endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ApiResponse[T](BaseModel):
    """Standard response envelope: success flag, typed data payload, optional error."""

    model_config = ConfigDict(frozen=True)

    success: bool
    data: T | None = None
    error: str | None = None
