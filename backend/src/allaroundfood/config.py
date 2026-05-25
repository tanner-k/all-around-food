"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Where pricing Parquet files live
    pricing_data_dir: Path = Path("data")


settings = Settings()
