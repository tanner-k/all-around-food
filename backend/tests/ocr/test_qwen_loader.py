"""Tests for the Qwen2-VL GGUF loader module."""

from __future__ import annotations

import base64
import os
from pathlib import Path

import pytest
from PIL import Image

from allaroundfood.ocr.qwen_loader import (
    FakeQwenVLClient,
    QwenVLClient,
    encode_image_to_data_url,
)

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures" / "ocr"


def _make_tiny_png(path: Path) -> None:
    """Create a 4x4 RGB PNG at path if it does not already exist."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        img = Image.new("RGB", (4, 4), color=(255, 0, 0))
        img.save(path, format="PNG")


class TestEncodeImageToDataUrl:
    def test_round_trip(self, tmp_path: Path) -> None:
        """encode_image_to_data_url should produce a valid base64 data URL."""
        png_path = tmp_path / "tiny.png"
        img = Image.new("RGB", (4, 4), color=(0, 128, 255))
        img.save(png_path, format="PNG")

        url = encode_image_to_data_url(png_path)

        assert url.startswith("data:image/png;base64,")
        encoded_part = url.split(",", 1)[1]
        decoded = base64.b64decode(encoded_part)
        assert len(decoded) > 0

    def test_fixture_png(self) -> None:
        """encode_image_to_data_url works on the shared fixture PNG."""
        tiny = FIXTURE_DIR / "tiny.png"
        _make_tiny_png(tiny)

        url = encode_image_to_data_url(tiny)
        assert url.startswith("data:image/png;base64,")

    def test_unknown_path_raises(self, tmp_path: Path) -> None:
        """encode_image_to_data_url raises FileNotFoundError for missing file."""
        with pytest.raises(FileNotFoundError):
            encode_image_to_data_url(tmp_path / "nonexistent.png")


class TestFakeQwenVLClient:
    def test_returns_default_response_when_no_canned(self) -> None:
        client = FakeQwenVLClient()
        result = client.chat([{"role": "user", "content": "hello"}])
        assert result == "{}"

    def test_returns_first_canned_response_when_no_hash_match(self) -> None:
        client = FakeQwenVLClient(canned={"any_key": '{"foo": "bar"}'})
        result = client.chat([{"role": "user", "content": "hello"}])
        assert result == '{"foo": "bar"}'

    def test_returns_exact_canned_by_hash(self) -> None:
        import hashlib

        messages = [{"role": "user", "content": "specific message"}]
        key = hashlib.sha256(str(messages).encode()).hexdigest()
        client = FakeQwenVLClient(canned={key: "EXACT_MATCH"})
        result = client.chat(messages)
        assert result == "EXACT_MATCH"

    def test_ignores_max_tokens_and_temperature(self) -> None:
        client = FakeQwenVLClient(canned={"x": "ok"})
        result = client.chat([], max_tokens=10, temperature=0.5)
        assert result == "ok"


class TestQwenVLClientLazy:
    def test_init_does_not_load_model(self, tmp_path: Path) -> None:
        """QwenVLClient.__init__ must not import or load llama_cpp."""
        fake_gguf = tmp_path / "fake.gguf"
        fake_gguf.write_bytes(b"fake")
        client = QwenVLClient(fake_gguf)
        # The internal _llama attr should remain None until first chat() call
        assert client._llama is None  # noqa: SLF001


@pytest.mark.slow
def test_real_gguf_chat() -> None:
    """Load a real GGUF and run a trivial chat — skipped unless QWEN_GGUF_PATH is set."""
    gguf_path_str = os.environ.get("QWEN_GGUF_PATH")
    if not gguf_path_str:
        pytest.skip("QWEN_GGUF_PATH not set; skipping real model test")

    gguf_path = Path(gguf_path_str)
    if not gguf_path.exists():
        pytest.skip(f"GGUF file not found at {gguf_path}")

    client = QwenVLClient(gguf_path, n_ctx=512)
    response = client.chat(
        [{"role": "user", "content": "Say hello in one word."}],
        max_tokens=10,
    )
    assert isinstance(response, str)
    assert len(response) > 0
