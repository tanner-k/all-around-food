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

    # Where local Parquet files live (recipes export, eval store)
    pricing_data_dir: Path = REPO_ROOT / "data"

    # ── Worker: Supabase service-role access (bypasses RLS; worker env only) ──
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    # ── Worker: Anthropic parsing key (moved off Vercel/frontend, ADR 0007 §3) ──
    anthropic_api_key_parsing: SecretStr | None = None

    # Run the LLM-as-judge eval pipeline after a recipe parse (fire-and-forget).
    run_evals: bool = True

    # ── Video import binaries + whisper.cpp (consolidated onto Settings) ──
    whisper_model: str = "base.en"
    whisper_models_dir: Path | None = None
    ffmpeg_bin: str = "ffmpeg"
    ytdlp_bin: str = "yt-dlp"

    # Poison-job retry cap: a job stops being reclaimed once attempts >= this.
    worker_max_attempts: int = 3


settings = Settings()
