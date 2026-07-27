"""Application configuration loaded from the environment via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. Every field maps to a variable documented in ``.env.example``."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Infrastructure ---
    database_url: str = "postgresql+asyncpg://newsradar:newsradar@localhost:5433/newsradar"
    redis_url: str = "redis://localhost:6380/0"

    # --- LLM ---
    anthropic_api_key: str = ""

    # --- Connectors / data providers ---
    perigon_api_key: str = ""
    telegram_api_id: str = ""
    telegram_api_hash: str = ""
    youtube_api_key: str = ""

    # --- Email delivery (SMTP) ---
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # --- Alerting ---
    slack_webhook_url: str = ""

    # --- Embeddings ---
    embedding_model: str = "intfloat/multilingual-e5-large"

    # --- Observability ---
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached :class:`Settings` instance."""

    return Settings()
