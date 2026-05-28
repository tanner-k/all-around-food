"""Tests for the receipt preprocessor module."""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from allaroundfood.ocr.preprocess import PreprocessedReceipt, preprocess_receipt

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "ocr"


def _make_tiny_png(path: Path) -> None:
    """Create a 4x4 RGB PNG at path if it does not already exist."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        img = Image.new("RGB", (4, 4), color=(255, 0, 0))
        img.save(path, format="PNG")


class TestPreprocessReceipt:
    def test_png_produces_single_grayscale_image(self, tmp_path: Path) -> None:
        """A PNG receipt produces exactly one output image in grayscale mode."""
        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        result = preprocess_receipt(tiny, output_dir=tmp_path)

        assert len(result.page_images) == 1
        out_img = Image.open(result.page_images[0])
        assert out_img.mode == "L"

    def test_output_is_png(self, tmp_path: Path) -> None:
        """Preprocessed output must be a PNG file."""
        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        result = preprocess_receipt(tiny, output_dir=tmp_path)

        assert result.page_images[0].suffix == ".png"
        img = Image.open(result.page_images[0])
        assert img.format == "PNG"

    def test_jpeg_preprocesses(self, tmp_path: Path) -> None:
        """JPEG images are preprocessed to a single grayscale PNG."""
        jpeg_path = tmp_path / "receipt.jpg"
        img = Image.new("RGB", (8, 8), color=(100, 150, 200))
        img.save(jpeg_path, format="JPEG")

        out_dir = tmp_path / "out"
        out_dir.mkdir()
        result = preprocess_receipt(jpeg_path, output_dir=out_dir)

        assert len(result.page_images) == 1
        out_img = Image.open(result.page_images[0])
        assert out_img.mode == "L"

    def test_unsupported_extension_raises(self, tmp_path: Path) -> None:
        """Unsupported file types raise ValueError."""
        bad = tmp_path / "receipt.tiff"
        bad.write_bytes(b"fake")

        with pytest.raises(ValueError, match="Unsupported file type"):
            preprocess_receipt(bad, output_dir=tmp_path)

    def test_missing_file_raises(self, tmp_path: Path) -> None:
        """FileNotFoundError raised when file does not exist."""
        with pytest.raises(FileNotFoundError):
            preprocess_receipt(tmp_path / "nonexistent.png", output_dir=tmp_path)

    def test_preprocessed_receipt_model(self, tmp_path: Path) -> None:
        """PreprocessedReceipt correctly reports is_multipage."""
        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        result = preprocess_receipt(tiny, output_dir=tmp_path)
        assert isinstance(result, PreprocessedReceipt)
        assert result.is_multipage is False
        assert len(result.page_images) == 1

    def test_caller_supplied_output_dir_no_temp_dir(self, tmp_path: Path) -> None:
        """When output_dir is supplied, temp_dir on result is None."""
        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        result = preprocess_receipt(tiny, output_dir=tmp_path)

        assert result.temp_dir is None

    def test_no_output_dir_sets_temp_dir(self) -> None:
        """When no output_dir given, temp_dir is set and output lives inside it."""
        import shutil

        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        result = preprocess_receipt(tiny)
        try:
            assert result.temp_dir is not None
            assert result.temp_dir.exists()
            for img_path in result.page_images:
                assert img_path.parent == result.temp_dir
        finally:
            if result.temp_dir is not None:
                shutil.rmtree(result.temp_dir, ignore_errors=True)


try:
    from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False


@pytest.mark.skipif(not _REPORTLAB_AVAILABLE, reason="reportlab not installed")
def test_pdf_multipage_produces_two_images(tmp_path: Path) -> None:
    """A 2-page PDF produces 2 preprocessed images."""
    pdf_path = tmp_path / "two_page.pdf"

    # Build a minimal 2-page PDF via reportlab
    c = canvas.Canvas(str(pdf_path))
    c.drawString(10, 750, "Page 1")
    c.showPage()
    c.drawString(10, 750, "Page 2")
    c.showPage()
    c.save()

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    result = preprocess_receipt(pdf_path, output_dir=out_dir)

    assert len(result.page_images) == 2
    for img_path in result.page_images:
        out_img = Image.open(img_path)
        assert out_img.mode == "L"
