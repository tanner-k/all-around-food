"""Tests for the in-process whisper.cpp transcription wrapper."""

from __future__ import annotations

from pathlib import Path

import pytest

from allaroundfood.transcription import (
    FakeTranscriber,
    TranscriptionError,
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
    def __init__(self, text: str) -> None:
        self.text = text


class _StubModel:
    def __init__(self, segments: list[_StubSegment]) -> None:
        self._segments = segments

    def transcribe(self, media: str) -> list[_StubSegment]:
        return self._segments


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
