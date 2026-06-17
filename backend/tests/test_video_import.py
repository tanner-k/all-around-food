"""Tests for social video text import."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from allaroundfood.transcription import FakeTranscriber
from allaroundfood.video_import import (
    VideoImportBinaryStatus,
    VideoImportError,
    VideoImportSettings,
    _fetch_video_text_sync,
    check_video_import_binaries,
    validate_video_url,
)


def test_validate_video_url_accepts_instagram_and_tiktok() -> None:
    """Supported Instagram and TikTok hosts are accepted."""
    assert validate_video_url("https://www.instagram.com/reel/abc") == "instagram"
    assert validate_video_url("https://vm.tiktok.com/abc") == "tiktok"


def test_validate_video_url_rejects_unknown_host() -> None:
    """Unsupported hosts get a friendly validation error."""
    with pytest.raises(VideoImportError) as exc:
        validate_video_url("https://example.com/video")

    assert "Instagram and TikTok" in exc.value.message
    assert exc.value.status_code == 422


def test_video_import_settings_read_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Video import settings are read from the expected environment names."""
    monkeypatch.setenv("YTDLP_BIN", "/opt/bin/yt-dlp")
    monkeypatch.setenv("WHISPER_MODEL", "tiny.en")
    monkeypatch.setenv("WHISPER_MODELS_DIR", "/opt/models")

    settings = VideoImportSettings.from_env()

    assert settings.ytdlp_bin == "/opt/bin/yt-dlp"
    assert settings.whisper_model == "tiny.en"
    assert settings.whisper_models_dir == "/opt/models"


def test_fetch_video_text_runs_pipeline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The video pipeline downloads, extracts, transcribes, and returns text."""
    commands: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        commands.append(cmd)
        assert check is True
        assert capture_output is True
        assert text is True
        assert timeout == 30

        if cmd[0] == "yt-dlp":
            output_template = Path(cmd[cmd.index("-o") + 1])
            tmp_path = output_template.parent
            (tmp_path / "source.mp4").write_bytes(b"video")
            (tmp_path / "source.info.json").write_text(
                json.dumps(
                    {
                        "description": "Caption ingredients: pasta and tomatoes",
                        "thumbnail": "https://example.com/thumb.jpg",
                        "duration": 12.5,
                    }
                ),
                encoding="utf-8",
            )
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    result = _fetch_video_text_sync(
        "https://www.instagram.com/reel/abc",
        VideoImportSettings(timeout_s=30),
        FakeTranscriber(transcript="mix the eggs and flour"),
    )

    assert [cmd[0] for cmd in commands] == ["yt-dlp", "yt-dlp", "ffmpeg"]
    assert result.platform == "instagram"
    assert result.caption == "Caption ingredients: pasta and tomatoes"
    assert "mix the eggs and flour" in result.transcript
    assert result.thumbnail_url == "https://example.com/thumb.jpg"
    assert result.duration_s == 12.5


def test_fetch_video_text_allows_caption_without_transcript(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A transcription failure falls back to caption-only when a caption exists."""

    def fake_run(
        cmd: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[0] == "yt-dlp":
            output_template = Path(cmd[cmd.index("-o") + 1])
            tmp_path = output_template.parent
            (tmp_path / "source.mp4").write_bytes(b"video")
            (tmp_path / "source.info.json").write_text(
                json.dumps({"description": "Caption has the whole recipe"}),
                encoding="utf-8",
            )
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    result = _fetch_video_text_sync(
        "https://www.tiktok.com/@cook/video/123",
        VideoImportSettings(timeout_s=30),
        FakeTranscriber(error=VideoImportError("boom", status_code=502)),
    )

    assert result.platform == "tiktok"
    assert result.caption == "Caption has the whole recipe"
    assert result.transcript == ""


def test_fetch_video_text_reraises_when_no_caption(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A transcription failure with no caption surfaces the error."""

    def fake_run(
        cmd: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[0] == "yt-dlp":
            output_template = Path(cmd[cmd.index("-o") + 1])
            tmp_path = output_template.parent
            (tmp_path / "source.mp4").write_bytes(b"video")
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(timeout_s=30),
            FakeTranscriber(error=VideoImportError("boom", status_code=502)),
        )

    assert exc.value.status_code == 502


def test_fetch_video_text_missing_ytdlp_is_friendly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing binaries surface as friendly service errors."""

    def fake_run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.tiktok.com/@cook/video/123",
            VideoImportSettings(timeout_s=30),
            FakeTranscriber(transcript="ignored"),
        )

    assert "yt-dlp is not installed" in exc.value.message
    assert exc.value.status_code == 503


def test_fetch_video_text_requires_caption_or_transcript(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A video with no text returns a reviewable import error."""

    def fake_run(
        cmd: list[str],
        *,
        check: bool,
        capture_output: bool,
        text: bool,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        if cmd[0] == "yt-dlp":
            output_template = Path(cmd[cmd.index("-o") + 1])
            tmp_path = output_template.parent
            (tmp_path / "source.mp4").write_bytes(b"video")
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(timeout_s=30),
            FakeTranscriber(transcript=""),
        )

    assert "caption or hear enough speech" in exc.value.message
    assert exc.value.status_code == 422


def test_fetch_video_text_sanitizes_ytdlp_stderr(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """yt-dlp failure stderr never leaks into the user-facing error message."""
    leaky_stderr = (
        "WARNING: [Instagram] ZZZ: Instagram API is not granting access\n"
        "ERROR: [Instagram] ZZZ: Instagram sent an empty media response. "
        "See https://github.com/yt-dlp/yt-dlp/wiki/FAQ\n"
        "Confirm you are on the latest version using yt-dlp -U"
    )

    def fake_run(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise subprocess.CalledProcessError(
            returncode=1,
            cmd=["yt-dlp"],
            stderr=leaky_stderr,
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)

    with (
        caplog.at_level("WARNING", logger="allaroundfood.video_import"),
        pytest.raises(VideoImportError) as exc,
    ):
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(timeout_s=30),
            FakeTranscriber(transcript="ignored"),
        )

    message = exc.value.message
    for fragment in ("WARNING:", "ERROR:", "yt-dlp -U", "github.com"):
        assert fragment not in message, (
            f"User-facing error leaked stderr fragment {fragment!r}: {message!r}"
        )
    assert exc.value.status_code == 422

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "yt-dlp -U" in logged, "raw yt-dlp stderr should still be logged server-side"


def test_check_video_import_binaries_resolves_both(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When yt-dlp and ffmpeg are on PATH, the status reports their absolute paths."""

    def fake_which(name: str) -> str | None:
        return {"yt-dlp": "/opt/bin/yt-dlp", "ffmpeg": "/opt/bin/ffmpeg"}.get(name)

    monkeypatch.setattr("allaroundfood.video_import.shutil.which", fake_which)

    status = check_video_import_binaries(VideoImportSettings())

    assert isinstance(status, VideoImportBinaryStatus)
    assert status.ytdlp == "/opt/bin/yt-dlp"
    assert status.ffmpeg == "/opt/bin/ffmpeg"
    assert status.missing == ()


def test_check_video_import_binaries_reports_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing binaries are surfaced in the `missing` tuple."""

    monkeypatch.setattr(
        "allaroundfood.video_import.shutil.which",
        lambda name: None,
    )

    status = check_video_import_binaries(VideoImportSettings())

    assert status.ytdlp is None
    assert status.ffmpeg is None
    assert set(status.missing) == {"yt-dlp", "ffmpeg"}


@pytest.mark.network
@pytest.mark.skip(
    reason="Requires a public recipe video URL plus yt-dlp, ffmpeg, and a whisper model."
)
def test_fetch_video_text_full_pipeline_public_video() -> None:
    """Exercise the real video pipeline when external services are available."""
    _fetch_video_text_sync("https://www.tiktok.com/@example/video/000")
