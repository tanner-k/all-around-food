"""ZIP code centroid resolver.

Uses the pyzipcode library to convert a US ZIP code to a lat/lon centroid.
All ZIP-specific data lives in the pyzipcode SQLite bundle — no hardcoded
ZIPs here.  Test fixtures are the only place hardcoded ZIPs appear.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class UnknownZipError(ValueError):
    """Raised when a ZIP code cannot be resolved to a centroid."""


class ZipCentroid(BaseModel):
    """Lat/lon centroid for a US ZIP code.

    # forward-compat: user_id
    """

    model_config = ConfigDict(frozen=True)

    zip: str
    lat: float
    lon: float
    city: str | None
    state: str | None


def resolve_zip(zip_code: str) -> ZipCentroid:
    """Resolve a US ZIP code to a geographic centroid.

    Args:
        zip_code: A 5-digit US ZIP code string.

    Returns:
        ZipCentroid with lat/lon and optional city/state.

    Raises:
        UnknownZipError: If the ZIP code is not found in the database.
    """
    try:
        from pyzipcode import ZipCodeDatabase  # type: ignore[import-untyped]
    except ImportError as exc:  # pragma: no cover
        raise UnknownZipError(
            f"pyzipcode is not installed; cannot resolve ZIP '{zip_code}'"
        ) from exc

    try:
        db = ZipCodeDatabase()
        record = db[zip_code]
    except (IndexError, KeyError, Exception) as exc:
        raise UnknownZipError(f"Unknown ZIP code: '{zip_code}'") from exc

    if record is None:
        raise UnknownZipError(f"Unknown ZIP code: '{zip_code}'")

    return ZipCentroid(
        zip=str(record.zip),
        lat=float(record.latitude),
        lon=float(record.longitude),
        city=record.city or None,
        state=record.state or None,
    )
