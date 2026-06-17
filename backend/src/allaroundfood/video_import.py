"""Video text import pipeline for Instagram and TikTok URLs."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal
from urllib.parse import urlparse

from allaroundfood.models import VideoImportResult
from allaroundfood.transcription import (
    Transcriber,
    TranscriptionError,
    WhisperCppTranscriber,
)

logger = logging.getLogger(__name__)

SUPPORTED_VIDEO_HOSTS = {
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
}


class VideoImportError(Exception):
    """User-facing error raised when video import cannot complete."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        """Initialize a friendly video import error."""
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class VideoImportBinaryStatus:
    """Resolved absolute paths for the external binaries the importer relies on."""

    ytdlp: str | None
    ffmpeg: str | None

    @property
    def missing(self) -> tuple[str, ...]:
        """Return the friendly names of any binaries that could not be resolved."""
        return tuple(
            name
            for name, path in (("yt-dlp", self.ytdlp), ("ffmpeg", self.ffmpeg))
            if path is None
        )


def check_video_import_binaries(
    settings: VideoImportSettings | None = None,
) -> VideoImportBinaryStatus:
    """Resolve the configured yt-dlp and ffmpeg binaries via shutil.which.

    Transcription runs in-process via whisper.cpp (pywhispercpp), so there is
    no transcription binary to resolve here — only yt-dlp and ffmpeg.
    """
    active = settings or VideoImportSettings.from_env()
    return VideoImportBinaryStatus(
        ytdlp=shutil.which(active.ytdlp_bin),
        ffmpeg=shutil.which(active.ffmpeg_bin),
    )


@dataclass(frozen=True)
class VideoImportSettings:
    """Runtime settings for the video import pipeline."""

    ytdlp_bin: str = "yt-dlp"
    ffmpeg_bin: str = "ffmpeg"
    timeout_s: int = 180
    whisper_model: str = "base.en"
    whisper_models_dir: str | None = None

    @classmethod
    def from_env(cls) -> VideoImportSettings:
        """Build settings from environment variables."""
        return cls(
            ytdlp_bin=os.environ.get("YTDLP_BIN", "yt-dlp"),
            ffmpeg_bin=os.environ.get("FFMPEG_BIN", "ffmpeg"),
            timeout_s=int(os.environ.get("VIDEO_IMPORT_TIMEOUT_S", "180")),
            whisper_model=os.environ.get("WHISPER_MODEL", "base.en"),
            whisper_models_dir=os.environ.get("WHISPER_MODELS_DIR"),
        )


async def fetch_video_text(
    source_url: str,
    settings: VideoImportSettings | None = None,
    transcriber: Transcriber | None = None,
) -> VideoImportResult:
    """Fetch caption and transcript text for a supported social video URL."""
    return await asyncio.to_thread(
        _fetch_video_text_sync, source_url, settings, transcriber
    )


def _fetch_video_text_sync(
    source_url: str,
    settings: VideoImportSettings | None = None,
    transcriber: Transcriber | None = None,
) -> VideoImportResult:
    """Synchronous implementation used by the async FastAPI endpoint."""
    active_settings = settings or VideoImportSettings.from_env()
    platform = validate_video_url(source_url)

    if transcriber is None:
        transcriber = WhisperCppTranscriber(
            model=active_settings.whisper_model,
            models_dir=(
                Path(active_settings.whisper_models_dir)
                if active_settings.whisper_models_dir
                else None
            ),
        )

    with TemporaryDirectory(prefix="allaroundfood-video-") as tmp:
        tmp_path = Path(tmp)
        video_path, metadata = _download_video(source_url, tmp_path, active_settings)
        caption = _metadata_caption(metadata)
        audio_path = _extract_audio(video_path, tmp_path, active_settings)
        try:
            transcript = _transcribe_audio(audio_path, transcriber)
        except VideoImportError:
            if not caption:
                raise
            logger.warning(
                "Transcription failed; falling back to caption-only import."
            )
            transcript = ""

    cleaned_transcript = _clean_transcript(transcript)
    if not cleaned_transcript and not caption:
        raise VideoImportError(
            "We could not find a caption or hear enough speech in that video to build a recipe.",
            status_code=422,
        )

    return VideoImportResult(
        source_url=source_url,
        platform=platform,
        caption=caption,
        transcript=cleaned_transcript,
        thumbnail_url=_metadata_string(metadata, "thumbnail"),
        duration_s=_metadata_duration(metadata),
    )


def validate_video_url(source_url: str) -> Literal["instagram", "tiktok"]:
    """Validate and return the platform for a social video URL."""
    parsed = urlparse(source_url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not host:
        raise VideoImportError(
            "Enter a valid Instagram or TikTok video URL.",
            status_code=422,
        )
    if host not in SUPPORTED_VIDEO_HOSTS:
        raise VideoImportError(
            "Video import currently supports Instagram and TikTok links only.",
            status_code=422,
        )
    if "instagram" in host:
        return "instagram"
    return "tiktok"


def _download_video(
    source_url: str, tmp_path: Path, settings: VideoImportSettings
) -> tuple[Path, dict[str, Any]]:
    """Download media and metadata for a source video with yt-dlp."""
    output_template = tmp_path / "source.%(ext)s"
    metadata_path = tmp_path / "metadata.json"
    cmd = [
        settings.ytdlp_bin,
        "--no-playlist",
        "--write-info-json",
        "--skip-download",
        "-o",
        str(output_template),
        source_url,
    ]
    _run_command(
        cmd,
        missing="yt-dlp is not installed or YTDLP_BIN points to a missing binary.",
        failed="We could not read that video. It may be private, expired, or blocked.",
        timeout_s=settings.timeout_s,
    )

    info_json = next(tmp_path.glob("source.info.json"), None)
    metadata = _read_metadata(info_json)

    cmd = [
        settings.ytdlp_bin,
        "--no-playlist",
        "-f",
        "bv*+ba/best",
        "-o",
        str(output_template),
        source_url,
    ]
    _run_command(
        cmd,
        missing="yt-dlp is not installed or YTDLP_BIN points to a missing binary.",
        failed="We could not download that video. It may be private, expired, or blocked.",
        timeout_s=settings.timeout_s,
    )

    video_path = _find_downloaded_video(tmp_path)
    if video_path is None:
        raise VideoImportError("The video downloaded, but no media file was produced.")
    if info_json is not None:
        info_json.replace(metadata_path)
    return video_path, metadata


def _extract_audio(
    video_path: Path, tmp_path: Path, settings: VideoImportSettings
) -> Path:
    """Extract mono 16 kHz WAV audio with ffmpeg."""
    audio_path = tmp_path / "audio.wav"
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(audio_path),
    ]
    _run_command(
        cmd,
        missing="ffmpeg is not installed or FFMPEG_BIN points to a missing binary.",
        failed="We could not extract audio from that video.",
        timeout_s=settings.timeout_s,
    )
    if not audio_path.exists():
        raise VideoImportError("ffmpeg finished without producing an audio file.")
    return audio_path


def _transcribe_audio(audio_path: Path, transcriber: Transcriber) -> str:
    """Transcribe audio in-process via whisper.cpp."""
    try:
        return transcriber.transcribe(audio_path)
    except TranscriptionError as exc:
        raise VideoImportError(
            "We couldn't transcribe the audio in that video.",
            status_code=502,
        ) from exc


def _run_command(
    cmd: list[str],
    *,
    missing: str,
    failed: str,
    timeout_s: int,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess and convert failures into friendly import errors."""
    try:
        return subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except FileNotFoundError as exc:
        raise VideoImportError(missing, status_code=503) from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoImportError(
            "Video import took too long. Try a shorter clip or try again later.",
            status_code=504,
        ) from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        if detail:
            logger.warning(
                "video import subprocess failed: %s exit=%s detail=%s",
                cmd[0],
                exc.returncode,
                detail,
            )
        raise VideoImportError(failed, status_code=422) from exc


def _find_downloaded_video(tmp_path: Path) -> Path | None:
    """Find the downloaded media file produced by yt-dlp."""
    excluded_suffixes = {".json", ".part", ".ytdl"}
    candidates = [
        path
        for path in tmp_path.iterdir()
        if path.is_file()
        and path.name.startswith("source.")
        and path.suffix not in excluded_suffixes
    ]
    return candidates[0] if candidates else None


def _read_metadata(info_json: Path | None) -> dict[str, Any]:
    """Read yt-dlp metadata from a JSON sidecar."""
    if info_json is None or not info_json.exists():
        return {}
    try:
        value = json.loads(info_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _metadata_caption(metadata: dict[str, Any]) -> str:
    """Extract caption/description text from yt-dlp metadata."""
    for key in ("description", "title", "fulltitle"):
        value = _metadata_string(metadata, key)
        if value:
            return value
    return ""


def _metadata_string(metadata: dict[str, Any], key: str) -> str | None:
    """Read a non-empty string metadata field."""
    value = metadata.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _metadata_duration(metadata: dict[str, Any]) -> float | None:
    """Read yt-dlp duration as seconds."""
    value = metadata.get("duration")
    if isinstance(value, int | float):
        return float(value)
    return None


def _clean_transcript(transcript: str) -> str:
    """Normalize transcript whitespace."""
    return re.sub(r"\s+", " ", transcript).strip()
