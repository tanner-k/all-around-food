"""Tests for ZIP centroid resolver."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from allaroundfood.pricing.locations.resolver import UnknownZipError, ZipCentroid, resolve_zip


class TestResolveZip:
    """Tests for resolve_zip function."""

    def test_known_zip_returns_centroid(self) -> None:
        # 84065 = Riverton, UT — known to exist in pyzipcode db
        result = resolve_zip("84065")
        assert isinstance(result, ZipCentroid)
        assert result.zip == "84065"
        assert result.city is not None
        assert result.state is not None
        # Approximate lat/lon bounds for Riverton, UT
        assert 40.0 < result.lat < 41.5
        assert -113.0 < result.lon < -111.0

    def test_result_is_frozen(self) -> None:
        result = resolve_zip("84065")
        with pytest.raises(ValidationError):
            result.zip = "00000"  # type: ignore[misc]

    def test_valid_zip_10001(self) -> None:
        # 10001 = New York, NY
        result = resolve_zip("10001")
        assert result.zip == "10001"
        assert result.lat != 0.0
        assert result.lon != 0.0

    def test_valid_zip_90210(self) -> None:
        # 90210 = Beverly Hills, CA
        result = resolve_zip("90210")
        assert result.zip == "90210"
        assert result.state == "CA"

    def test_unknown_zip_raises_unknown_zip_error(self) -> None:
        with pytest.raises(UnknownZipError):
            resolve_zip("00000")

    def test_unknown_zip_message_contains_zip(self) -> None:
        try:
            resolve_zip("00000")
        except UnknownZipError as exc:
            assert "00000" in str(exc)

    def test_invalid_format_raises_unknown_zip_error(self) -> None:
        with pytest.raises(UnknownZipError):
            resolve_zip("not-a-zip")

    def test_empty_string_raises_unknown_zip_error(self) -> None:
        with pytest.raises(UnknownZipError):
            resolve_zip("")

    def test_zip_centroid_has_expected_fields(self) -> None:
        result = resolve_zip("84065")
        assert hasattr(result, "zip")
        assert hasattr(result, "lat")
        assert hasattr(result, "lon")
        assert hasattr(result, "city")
        assert hasattr(result, "state")
