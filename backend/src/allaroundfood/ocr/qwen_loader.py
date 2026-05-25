"""Qwen2-VL GGUF loader: QwenVLClient, FakeQwenVLClient, and image encoding utilities.

All llama_cpp usage is confined to this module. Other OCR modules must go
through QwenVLClient or FakeQwenVLClient — never import llama_cpp directly.
"""

from __future__ import annotations

import base64
import hashlib
import logging
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)


def encode_image_to_data_url(path: Path) -> str:
    """Read an image file and return a base64-encoded data URL.

    Uses Pillow to detect the MIME type from the image format. The image is
    converted to RGB before encoding to ensure JPEG compatibility.

    Args:
        path: Path to the image file.

    Returns:
        A data URL string: ``data:image/<mime>;base64,<encoded>``.

    Raises:
        FileNotFoundError: If the image file does not exist.
        ValueError: If the image format cannot be determined.
    """
    import io

    img = Image.open(path)
    fmt = img.format
    if fmt is None:
        raise ValueError(f"Cannot determine image format for {path}")

    mime_map = {
        "JPEG": "jpeg",
        "JPG": "jpeg",
        "PNG": "png",
        "WEBP": "webp",
        "GIF": "gif",
        "BMP": "bmp",
        "TIFF": "tiff",
    }
    mime = mime_map.get(fmt.upper(), fmt.lower())

    buffer = io.BytesIO()
    img.save(buffer, format=fmt)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/{mime};base64,{encoded}"


class QwenVLClient:
    """Lazy-loading Qwen2-VL GGUF client backed by llama-cpp-python.

    The model is NOT loaded on __init__; loading happens on the first call
    to ``chat()``. The loaded instance is cached for subsequent calls.

    Args:
        gguf_path: Path to the Qwen2-VL GGUF model file.
        n_ctx: Context window size for the model.
        n_threads: Number of CPU threads; None lets llama_cpp choose.
    """

    def __init__(
        self,
        gguf_path: Path,
        *,
        n_ctx: int = 4096,
        n_threads: int | None = None,
    ) -> None:
        self._gguf_path = gguf_path
        self._n_ctx = n_ctx
        self._n_threads = n_threads
        self._llama: Any = None  # loaded lazily

    def _load(self) -> Any:
        """Load the Llama model on first use."""
        if self._llama is not None:
            return self._llama

        from llama_cpp import Llama

        kwargs: dict[str, Any] = {
            "model_path": str(self._gguf_path),
            "n_ctx": self._n_ctx,
            "verbose": False,
        }
        if self._n_threads is not None:
            kwargs["n_threads"] = self._n_threads

        logger.info("Loading Qwen2-VL GGUF from %s", self._gguf_path)
        self._llama = Llama(**kwargs)
        return self._llama

    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.0,
    ) -> str:
        """Run a chat completion with the Qwen2-VL model.

        Supports multimodal content blocks of the form::

            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}

        Args:
            messages: List of chat message dicts with ``role`` and ``content``.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature; 0.0 for greedy decoding.

        Returns:
            The generated text string from the model.
        """
        llama = self._load()
        response = llama.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return str(response["choices"][0]["message"]["content"])


class FakeQwenVLClient:
    """Deterministic test double for QwenVLClient.

    Returns canned responses keyed by a hash of the serialized messages
    or by a simple lookup key. Useful for fast, offline unit tests.

    Args:
        canned: Mapping from key → canned response string. The key is
            matched against the SHA-256 hex digest of the serialized
            messages string, falling back to a literal string match on
            the first element's content. If no match, returns the first
            value as a default, or an empty JSON object ``{}``.
    """

    def __init__(self, canned: dict[str, str] | None = None) -> None:
        self._canned = canned or {}

    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        max_tokens: int = 2048,
        temperature: float = 0.0,
    ) -> str:
        """Return a canned response for the given messages.

        Args:
            messages: List of chat message dicts (unused for routing logic
                beyond hash computation).
            max_tokens: Ignored by the fake.
            temperature: Ignored by the fake.

        Returns:
            A canned response string, or ``"{}"`` if no match is found.
        """
        key = hashlib.sha256(str(messages).encode()).hexdigest()
        if key in self._canned:
            return self._canned[key]

        # Fallback: return the first canned response if any
        if self._canned:
            return next(iter(self._canned.values()))

        return "{}"
