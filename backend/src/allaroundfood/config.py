"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Global application settings.

    All secrets are loaded from environment variables or a .env file.
    No values are hardcoded here — callers that need a secret call
    ``settings.kroger_client_id.get_secret_value()``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Kroger API credentials
    kroger_client_id: SecretStr | None = None
    kroger_client_secret: SecretStr | None = None

    # Kill-switch: set True to disable all unofficial scraping adapters
    disable_unofficial_ingestion: bool = False

    # Embedding model for canonical product matching
    embedding_model_name: str = "BAAI/bge-small-en-v1.5"

    # Where pricing/OCR Parquet files live
    pricing_data_dir: Path = REPO_ROOT / "data"

    # Path to Qwen2-VL GGUF model for OCR pipeline (set QWEN_GGUF_PATH env var)
    qwen_gguf_path: Path | None = None

    # ── Worker: Supabase service-role access (bypasses RLS; worker env only) ──
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    # Jev recipe classification; credentials remain on the worker.
    typesafe_api_key: SecretStr | None = None
    tesseract_bin: str = "tesseract"

    # Legacy, explicitly invoked evaluation tooling only; never recipe imports.
    anthropic_api_key_parsing: SecretStr | None = None

    # Run the LLM-as-judge eval pipeline after a recipe parse (fire-and-forget).
    run_evals: bool = False
    import_owner_user_id: str | None = None

    # ── Video import binaries + whisper.cpp (consolidated onto Settings) ──
    whisper_model: str = "small.en"
    whisper_cpu_only: bool = True
    whisper_models_dir: Path | None = None
    ffmpeg_bin: str = "ffmpeg"
    ytdlp_bin: str = "yt-dlp"
    video_import_timeout_s: int = 180
    worker_stale_after_minutes: int = 10  # Accepted for older local .env files; SQL owns leases.

    # Poison-job retry cap: a job stops being reclaimed once attempts >= this.
    worker_max_attempts: int = 3


settings = Settings()
