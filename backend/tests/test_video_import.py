"""Tests for social video text import."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import httpx
import pytest

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
    monkeypatch.setenv("WHISPR_URL", "http://localhost:9000")
    monkeypatch.setenv("YTDLP_BIN", "/opt/bin/yt-dlp")

    settings = VideoImportSettings.from_env()

    assert settings.whispr_url == "http://localhost:9000"
    assert settings.ytdlp_bin == "/opt/bin/yt-dlp"


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

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        assert url == "http://localhost:9000/api/stt/transcribe"
        assert files["audio"][0] == "audio.wav"
        assert timeout == 30
        return httpx.Response(
            200,
            json={"transcript": "Boil pasta. Add tomatoes."},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    result = _fetch_video_text_sync(
        "https://www.instagram.com/reel/abc",
        VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
    )

    assert [cmd[0] for cmd in commands] == ["yt-dlp", "yt-dlp", "ffmpeg"]
    assert result.platform == "instagram"
    assert result.caption == "Caption ingredients: pasta and tomatoes"
    assert result.transcript == "Boil pasta. Add tomatoes."
    assert result.thumbnail_url == "https://example.com/thumb.jpg"
    assert result.duration_s == 12.5


def test_fetch_video_text_allows_caption_without_transcript(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A caption-only video still returns useful text to Claude."""

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

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        return httpx.Response(
            200,
            json={"transcript": ""},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    result = _fetch_video_text_sync(
        "https://www.tiktok.com/@cook/video/123",
        VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
    )

    assert result.platform == "tiktok"
    assert result.caption == "Caption has the whole recipe"
    assert result.transcript == ""


def test_fetch_video_text_reads_whispr_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Whispr returns an API envelope with transcript text under data.raw."""

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

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        assert files["audio"][0] == "audio.wav"
        return httpx.Response(
            201,
            json={
                "success": True,
                "data": {"raw": "Use rice, eggs, soy sauce. Fry everything."},
                "error": None,
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    result = _fetch_video_text_sync(
        "https://www.instagram.com/reel/abc",
        VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
    )

    assert result.transcript == "Use rice, eggs, soy sauce. Fry everything."


def test_fetch_video_text_allows_caption_when_whispr_times_out(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A timed-out transcription can still continue to Claude with captions."""

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
                json.dumps(
                    {
                        "description": "Caption lists chickpeas, lemon, tahini",
                        "thumbnail": "https://example.com/hummus.jpg",
                        "duration": 18,
                    }
                ),
                encoding="utf-8",
            )
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    result = _fetch_video_text_sync(
        "https://www.instagram.com/reel/abc",
        VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
    )

    assert result.caption == "Caption lists chickpeas, lemon, tahini"
    assert result.transcript == ""
    assert result.thumbnail_url == "https://example.com/hummus.jpg"
    assert result.duration_s == 18


def test_fetch_video_text_does_not_fallback_for_whispr_connection_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Captions do not hide non-timeout transcription service failures."""

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
                json.dumps({"description": "Caption has enough recipe detail"}),
                encoding="utf-8",
            )
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
        )

    assert "transcription service is unavailable" in exc.value.message
    assert exc.value.status_code == 502


def test_fetch_video_text_does_not_fallback_for_unreadable_whispr_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Captions do not hide malformed transcription service responses."""

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
                json.dumps({"description": "Caption has enough recipe detail"}),
                encoding="utf-8",
            )
        elif cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        return httpx.Response(
            200,
            content=b"not json",
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
        )

    assert "unreadable response" in exc.value.message
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

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        return httpx.Response(
            200,
            json={"transcript": ""},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
        )

    assert "caption or hear enough speech" in exc.value.message
    assert exc.value.status_code == 422


def test_fetch_video_text_reports_whispr_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Slow whispr responses map to a clear timeout error."""

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

    def fake_post(
        url: str,
        *,
        files: dict[str, tuple[str, Any, str]],
        timeout: int,
    ) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr("allaroundfood.video_import.subprocess.run", fake_run)
    monkeypatch.setattr("allaroundfood.video_import.httpx.post", fake_post)

    with pytest.raises(VideoImportError) as exc:
        _fetch_video_text_sync(
            "https://www.instagram.com/reel/abc",
            VideoImportSettings(whispr_url="http://localhost:9000", timeout_s=30),
        )

    assert "Transcription took too long" in exc.value.message
    assert exc.value.status_code == 504


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
    reason="Requires a public recipe video URL plus local whispr, yt-dlp, and ffmpeg."
)
def test_fetch_video_text_full_pipeline_public_video() -> None:
    """Exercise the real video pipeline when external services are available."""
    _fetch_video_text_sync("https://www.tiktok.com/@example/video/000")
