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
    telegram_session: str = ""
    youtube_api_key: str = ""
    youtube_daily_quota_budget: int = 8000

    # Descriptive User-Agent (contact URL) sent by every HTTP connector.
    connector_user_agent: str = (
        "NewsRadarBot/1.0 (+https://newsradar.example/bot; contact=abuse@newsradar.example)"
    )

    # Optional overrides for the connector config files. When unset the packaged
    # defaults under ``<repo>/config/`` are used (resolved in ``connectors.config_files``).
    feeds_path: str = ""
    telegram_channels_path: str = ""

    # Enable the paid Perigon connector even when other gates would skip it.
    perigon_enabled: bool = True

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
