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
    embedding_batch_size: int = 32

    # --- LLM models & cost discipline ---
    # Cheap tier for per-document entity/sentiment/stance classification.
    haiku_model: str = "claude-haiku-4-5-20251001"
    # Frontier tier — event summaries and report generation ONLY.
    sonnet_model: str = "claude-sonnet-5"
    llm_max_concurrency: int = 8
    # Hard daily spend guard (USD). Enrichment degrades gracefully when exceeded.
    llm_daily_budget_usd: float = 25.0

    # --- Clustering (tunable without a code change) ---
    cluster_sim_threshold: float = 0.82
    cluster_decay_halflife_hours: float = 48.0
    # Candidate lookup window and the max time gap for assignment.
    cluster_candidate_window_hours: int = 72
    cluster_assign_max_gap_hours: int = 48

    # Bundled GeoNames cities extract (offline geo resolution).
    geonames_path: str = ""

    # --- Reports ---
    # Directory where rendered PDF report artifacts are written.
    report_artifact_dir: str = "artifacts"

    # --- Observability ---
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached :class:`Settings` instance."""

    return Settings()
