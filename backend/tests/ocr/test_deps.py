"""Tests for OCR worker dependency providers."""

from __future__ import annotations

import inspect

from allaroundfood.config import REPO_ROOT
from allaroundfood.ocr.deps import _ocr_data_dir


class TestOcrDataDir:
    def test_not_hardcoded_from_module_file(self) -> None:
        """_ocr_data_dir() must use settings rather than module file parents."""
        import allaroundfood.ocr.deps as deps_mod

        source = inspect.getsource(deps_mod._ocr_data_dir)
        assert "__file__" not in source, (
            "_ocr_data_dir() still references __file__, which produces a "
            "machine-specific hardcoded path. Use settings.pricing_data_dir instead."
        )

    def test_ends_with_data(self) -> None:
        """_ocr_data_dir() must end with the 'data' directory component."""
        resolved = _ocr_data_dir()
        assert resolved.name == "data", f"Expected path ending in 'data', got: {resolved}"

    def test_returns_absolute_path(self) -> None:
        """_ocr_data_dir() must return an absolute Path."""
        resolved = _ocr_data_dir()
        assert resolved.is_absolute(), f"Expected absolute path, got: {resolved}"

    def test_defaults_to_repo_data_dir(self) -> None:
        """_ocr_data_dir() must default to the repo data dir, independent of cwd."""
        resolved = _ocr_data_dir()
        expected = REPO_ROOT / "data"
        assert resolved == expected, (
            f"Expected {expected}, got {resolved}. "
            "_ocr_data_dir() should use the repo-root default from settings."
        )
