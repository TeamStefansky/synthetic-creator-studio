"""Configuration — env vars only, no secrets in code.

Defaults to SQLite so the whole pipeline runs (and tests pass) with zero
infrastructure; point DATABASE_URL at Postgres in production.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Storage. SQLite for local/dev/test; Postgres in production.
    database_url: str = "sqlite:///./narrative.db"

    # Ingestion worker cadence (seconds) and which sources are enabled.
    poll_interval_seconds: int = 300
    # gdelt/bluesky/hackernews/reddit are free & keyless (real search, no signup);
    # x/telegram/newsapi need keys (else mock).
    enabled_sources: str = "x,telegram,rss,newsapi,gdelt,bluesky,hackernews,reddit"

    # Optional real-source credentials (mock data is used when absent).
    x_bearer_token: str | None = None
    newsapi_key: str | None = None
    telegram_bot_token: str | None = None
    # Reddit works keyless (best-effort); set these for reliable OAuth access.
    reddit_client_id: str | None = None
    reddit_client_secret: str | None = None

    # Comma-separated default queries/handles/feeds the connectors pull.
    x_query: str = "disinformation OR fake news"
    rss_feeds: str = ""  # comma-separated URLs (real when provided)

    # GDELT (free, keyless global news search) tuning.
    gdelt_timespan: str = "3d"      # how far back to search
    gdelt_max_records: int = 75     # articles per query

    # Default webhook for alert rules that don't set their own.
    alert_webhook_url: str | None = None

    # Optional API keys for the public API (comma-separated). Empty = open.
    api_keys: str = ""

    def sources(self) -> list[str]:
        return [s.strip() for s in self.enabled_sources.split(",") if s.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        # Render/Heroku hand out postgres://; SQLAlchemy 2.x needs postgresql://.
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url


settings = Settings()
