"""In-process speech-to-text via whisper.cpp (pywhispercpp).

All ``pywhispercpp`` usage is confined to this module. Other modules must go
through ``Transcriber`` / ``WhisperCppTranscriber`` / ``FakeTranscriber`` —
never import ``pywhispercpp`` directly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Raised when the whisper.cpp model fails to load or transcribe."""


@dataclass(frozen=True)
class TranscriptionSegment:
    """A text segment with start and end times in seconds."""

    start_seconds: float
    end_seconds: float
    text: str


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
        cpu_only: bool = False,
        initial_prompt: str | None = None,
    ) -> None:
        self._model = model
        self._models_dir = models_dir
        self._cpu_only = cpu_only
        self._initial_prompt = initial_prompt
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
        if self._cpu_only:
            kwargs.update(context_params={"use_gpu": False}, n_threads=4)

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
        segments = self._decode(audio_path, initial_prompt=self._initial_prompt)
        try:
            return " ".join(str(seg.text).strip() for seg in segments).strip()
        except Exception as exc:  # noqa: BLE001 - surfaced as TranscriptionError
            raise TranscriptionError(f"Failed to transcribe {audio_path}: {exc}") from exc

    def transcribe_segments(
        self, audio_path: Path, *, initial_prompt: str | None = None
    ) -> list[TranscriptionSegment]:
        """Transcribe a WAV file into stripped text segments timed in seconds."""
        segments = self._decode(audio_path, initial_prompt=initial_prompt)
        try:
            return [
                TranscriptionSegment(seg.t0 / 100, seg.t1 / 100, str(seg.text).strip())
                for seg in segments
            ]
        except Exception as exc:  # noqa: BLE001 - surfaced as TranscriptionError
            raise TranscriptionError(f"Failed to transcribe {audio_path}: {exc}") from exc

    def _decode(self, audio_path: Path, *, initial_prompt: str | None) -> Any:
        client = self._load()
        try:
            # pywhispercpp retains decoder parameters on its cached model.
            return client.transcribe(str(audio_path), initial_prompt=initial_prompt or "")
        except TranscriptionError:
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as TranscriptionError
            raise TranscriptionError(f"Failed to transcribe {audio_path}: {exc}") from exc


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
