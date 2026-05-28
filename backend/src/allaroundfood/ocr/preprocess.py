"""Receipt image preprocessing: deskew, grayscale, normalize, and PDF splitting.

Converts any supported receipt input (JPEG, PNG, PDF) into a list of
preprocessed PNG images ready for the OCR model.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from PIL import Image, ImageOps
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

_SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}


class PreprocessedReceipt(BaseModel):
    """Result of preprocessing a receipt file.

    Attributes:
        original_path: Path to the original input file.
        page_images: Preprocessed PNG paths (one per page for PDFs).
        is_multipage: True when the input produced more than one image.
        temp_dir: Set when ``preprocess_receipt`` created an internal temp
            directory (i.e. no ``output_dir`` was provided). The caller is
            responsible for cleaning it up via ``shutil.rmtree`` or a
            ``tempfile.TemporaryDirectory`` context manager. ``None`` when the
            caller supplied their own ``output_dir``.
    """

    model_config = ConfigDict(frozen=True)

    original_path: Path
    page_images: list[Path]
    is_multipage: bool
    temp_dir: Path | None = None


def _preprocess_pil_image(img: Image.Image, output_path: Path) -> Path:
    """Apply standard preprocessing to a PIL image and save as PNG.

    Steps:
        1. Auto-rotate via EXIF orientation tag.
        2. Convert to grayscale.
        3. Apply autocontrast to normalize brightness/contrast.

    Args:
        img: Source PIL image.
        output_path: Destination PNG path.

    Returns:
        The output_path after writing.
    """
    # 1. Respect EXIF orientation
    img = ImageOps.exif_transpose(img) or img

    # 2. Grayscale
    img = img.convert("L")

    # 3. Normalize brightness/contrast
    img = ImageOps.autocontrast(img)

    img.save(output_path, format="PNG")
    return output_path


def preprocess_receipt(
    input_path: Path,
    *,
    output_dir: Path | None = None,
) -> PreprocessedReceipt:
    """Preprocess a receipt image or PDF into one or more PNG images.

    PDFs are split into one image per page. Images are deskewed (via EXIF
    orientation), converted to grayscale, and contrast-normalized.

    Args:
        input_path: Path to the receipt file (.jpg, .jpeg, .png, or .pdf).
        output_dir: Directory where preprocessed PNGs are written. When
            provided, the caller owns the directory and is responsible for
            cleanup. When ``None``, an internal ``tempfile.mkdtemp`` directory
            is created and its path is returned in
            ``PreprocessedReceipt.temp_dir`` — the caller must then clean it
            up (e.g. via ``shutil.rmtree``).

    Returns:
        ``PreprocessedReceipt`` containing the page image paths.
        ``temp_dir`` is ``None`` when *output_dir* was supplied, or the path to
        the internally-created temp directory otherwise.

    Raises:
        ValueError: If the file extension is not supported.
        FileNotFoundError: If input_path does not exist.
    """
    if not input_path.exists():
        raise FileNotFoundError(f"Receipt file not found: {input_path}")

    ext = input_path.suffix.lower()
    if ext not in _SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Supported: {sorted(_SUPPORTED_EXTENSIONS)}"
        )

    created_temp_dir: Path | None = None
    if output_dir is None:
        created_temp_dir = Path(tempfile.mkdtemp(prefix="ocr_preprocess_"))
        work_dir = created_temp_dir
    else:
        work_dir = output_dir

    output_paths: list[Path] = []

    if ext == ".pdf":
        from pdf2image import convert_from_path

        pages = convert_from_path(str(input_path))
        for page_num, page_img in enumerate(pages, start=1):
            out = work_dir / f"page_{page_num:03d}.png"
            _preprocess_pil_image(page_img, out)
            output_paths.append(out)
            logger.debug("Preprocessed PDF page %d → %s", page_num, out)
    else:
        img = Image.open(input_path)
        out = work_dir / "page_001.png"
        _preprocess_pil_image(img, out)
        output_paths.append(out)
        logger.debug("Preprocessed image %s → %s", input_path, out)

    return PreprocessedReceipt(
        original_path=input_path,
        page_images=output_paths,
        is_multipage=len(output_paths) > 1,
        temp_dir=created_temp_dir,
    )
