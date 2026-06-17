"""In-process speech-to-text via whisper.cpp (pywhispercpp).

All ``pywhispercpp`` usage is confined to this module. Other modules must go
through ``Transcriber`` / ``WhisperCppTranscriber`` / ``FakeTranscriber`` —
never import ``pywhispercpp`` directly.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Raised when the whisper.cpp model fails to load or transcribe."""


class Transcriber(Protocol):
    """Protocol for audio-to-text transcribers."""

    def transcribe(self, audio_path: Path) -> str:
        """Transcribe the audio at ``audio_path`` to text."""
        ...


class WhisperCppTranscriber:
    """Lazy-loading whisper.cpp transcriber backed by pywhispercpp.

    The model is NOT loaded on __init__; loading happens on the first call to
    ``transcribe()``. The loaded instance is cached for subsequent calls.

    Args:
        model: A known model name (e.g. "base.en", "tiny.en") that
            auto-downloads, or an absolute path to a ggml ``.bin`` file.
        models_dir: Overrides the download/lookup directory; None uses the
            pywhispercpp default.
    """

    def __init__(
        self,
        model: str = "base.en",
        models_dir: Path | None = None,
    ) -> None:
        self._model = model
        self._models_dir = models_dir
        self._client: Any = None  # loaded lazily

    def _load(self) -> Any:
        """Load the whisper.cpp model on first use."""
        if self._client is not None:
            return self._client

        from pywhispercpp.model import Model

        kwargs: dict[str, Any] = {
            "model": self._model,
            "redirect_whispercpp_logs_to": False,
        }
        if self._models_dir is not None:
            kwargs["models_dir"] = str(self._models_dir)

        try:
            logger.info("Loading whisper.cpp model %s", self._model)
            self._client = Model(**kwargs)
        except Exception as exc:  # noqa: BLE001 - surfaced as TranscriptionError
            raise TranscriptionError(
                f"Failed to load whisper.cpp model {self._model!r}: {exc}"
            ) from exc
        return self._client

    def transcribe(self, audio_path: Path) -> str:
        """Transcribe a 16 kHz mono WAV file to text.

        Args:
            audio_path: Path to the WAV file produced by the audio pipeline.

        Returns:
            The transcribed text with segments joined by a single space.

        Raises:
            TranscriptionError: If the model fails to load or transcribe.
        """
        client = self._load()
        try:
            segments = client.transcribe(str(audio_path))
            text = " ".join(str(seg.text).strip() for seg in segments)
        except TranscriptionError:
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as TranscriptionError
            raise TranscriptionError(
                f"Failed to transcribe {audio_path}: {exc}"
            ) from exc
        return text.strip()


class FakeTranscriber:
    """Deterministic test double for ``Transcriber``.

    Args:
        transcript: The text returned by ``transcribe()``.
        error: If set, ``transcribe()`` raises this instead of returning text.
    """

    def __init__(self, transcript: str = "", error: Exception | None = None) -> None:
        self._transcript = transcript
        self._error = error

    def transcribe(self, audio_path: Path) -> str:
        """Return the canned transcript or raise the canned error."""
        if self._error is not None:
            raise self._error
        return self._transcript
