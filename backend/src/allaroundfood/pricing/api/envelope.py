"""Generic API response envelope for pricing endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ApiResponse(BaseModel):
    """Standard response envelope: success flag, data payload, optional error."""

    model_config = ConfigDict(frozen=True)

    success: bool
    data: Any = None
    error: str | None = None
