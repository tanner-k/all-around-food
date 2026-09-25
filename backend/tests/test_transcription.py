"""Tests for the in-process whisper.cpp transcription wrapper."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from allaroundfood.transcription import (
    FakeTranscriber,
    TranscriptionError,
    TranscriptionSegment,
    WhisperCppTranscriber,
)


def test_fake_transcriber_returns_transcript() -> None:
    """FakeTranscriber returns its configured transcript."""
    fake = FakeTranscriber(transcript="hello world")
    assert fake.transcribe(Path("audio.wav")) == "hello world"


def test_fake_transcriber_raises_configured_error() -> None:
    """FakeTranscriber raises its configured error."""
    fake = FakeTranscriber(error=RuntimeError("boom"))
    with pytest.raises(RuntimeError, match="boom"):
        fake.transcribe(Path("audio.wav"))


class _StubSegment:
    def __init__(self, text: str, t0: int = 0, t1: int = 0) -> None:
        self.text = text
        self.t0 = t0
        self.t1 = t1


class _StubModel:
    def __init__(self, segments: list[_StubSegment]) -> None:
        self._segments = segments
        self.prompts: list[str] = []

    def transcribe(self, media: str, *, initial_prompt: str) -> list[_StubSegment]:
        if not isinstance(initial_prompt, str):
            raise TypeError("initial_prompt must be str")
        self.prompts.append(initial_prompt)
        return self._segments


def test_timed_segments_convert_centiseconds_and_strip_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transcriber = WhisperCppTranscriber()
    stub = _StubModel([_StubSegment("  mix eggs  ", 125, 345)])
    monkeypatch.setattr(transcriber, "_load", lambda: stub)

    segments = transcriber.transcribe_segments(Path("audio.wav"))

    assert segments == [TranscriptionSegment(1.25, 3.45, "mix eggs")]
    with pytest.raises(FrozenInstanceError):
        segments[0].text = "changed"


def test_prompt_is_reset_on_cached_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transcriber = WhisperCppTranscriber()
    stub = _StubModel([_StubSegment("  mix eggs  ", 0, 100)])
    monkeypatch.setattr(transcriber, "_load", lambda: stub)

    transcriber.transcribe_segments(Path("audio.wav"), initial_prompt="recipe words")
    transcriber.transcribe_segments(Path("audio.wav"))
    assert transcriber.transcribe(Path("audio.wav")) == "mix eggs"
    assert stub.prompts == ["recipe words", "", ""]


def test_timed_segments_wrap_decode_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class _BrokenModel:
        def transcribe(
            self, media: str, *, initial_prompt: str | None = None
        ) -> list[_StubSegment]:
            raise ValueError("kaboom")

    transcriber = WhisperCppTranscriber()
    monkeypatch.setattr(transcriber, "_load", lambda: _BrokenModel())

    with pytest.raises(TranscriptionError, match="Failed to transcribe audio.wav"):
        transcriber.transcribe_segments(Path("audio.wav"))


def test_string_transcribe_wraps_segment_processing_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _BadSegment:
        @property
        def text(self) -> str:
            raise ValueError("bad segment")

    transcriber = WhisperCppTranscriber()
    monkeypatch.setattr(transcriber, "_load", lambda: _StubModel([_BadSegment()]))

    with pytest.raises(TranscriptionError, match="Failed to transcribe audio.wav"):
        transcriber.transcribe(Path("audio.wav"))


def test_whispercpp_transcriber_joins_segment_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """transcribe() joins each segment's stripped text with a single space."""
    transcriber = WhisperCppTranscriber()
    stub = _StubModel([_StubSegment("  mix the eggs "), _StubSegment("and flour  ")])
    monkeypatch.setattr(transcriber, "_load", lambda: stub)

    assert transcriber.transcribe(Path("audio.wav")) == "mix the eggs and flour"


def test_whispercpp_transcriber_wraps_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failure inside the underlying client becomes a TranscriptionError."""

    class _BrokenModel:
        def transcribe(self, media: str) -> list[_StubSegment]:
            raise ValueError("kaboom")

    transcriber = WhisperCppTranscriber()
    monkeypatch.setattr(transcriber, "_load", lambda: _BrokenModel())

    with pytest.raises(TranscriptionError):
        transcriber.transcribe(Path("audio.wav"))


def test_cpu_transcription_disables_gpu(monkeypatch: pytest.MonkeyPatch) -> None:
    """The prototype benchmark must not silently use the Mac GPU."""
    from pywhispercpp import model

    captured: dict[str, object] = {}

    def create_model(**kwargs: object) -> _StubModel:
        captured.update(kwargs)
        return _StubModel([_StubSegment("Mix well.")])

    monkeypatch.setattr(model, "Model", create_model)
    transcriber = WhisperCppTranscriber(cpu_only=True)
    assert transcriber.transcribe(Path("audio.wav")) == "Mix well."
    assert captured["context_params"] == {"use_gpu": False}
    assert captured["n_threads"] == 4


def test_caption_context_reaches_plain_transcription(monkeypatch: pytest.MonkeyPatch) -> None:
    transcriber = WhisperCppTranscriber(initial_prompt="Recipe context from caption: pancetta")
    stub = _StubModel([_StubSegment("Fry pancetta.")])
    monkeypatch.setattr(transcriber, "_load", lambda: stub)
    assert transcriber.transcribe(Path("audio.wav")) == "Fry pancetta."
    assert stub.prompts == ["Recipe context from caption: pancetta"]
