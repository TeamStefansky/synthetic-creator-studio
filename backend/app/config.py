"""Application configuration.

Postgres is the production target; SQLite is the zero-infra default so the
suite runs anywhere (including this sandbox). Override via env / .env.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
STORAGE_DIR = BACKEND_ROOT / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SCS_", env_file=".env", extra="ignore")

    app_name: str = "Synthetic Creator Studio"

    # DB. Prod example: postgresql+psycopg://user:pass@host:5432/scs
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'scs.db'}"

    # Object storage root for assets + provenance manifests.
    storage_dir: Path = STORAGE_DIR

    # Secret used to sign provenance manifests (HMAC). MUST be set in prod.
    # In a real deployment this is a private signing key for C2PA claims.
    provenance_signing_key: str = "dev-only-provenance-key-change-me"

    # Visible-label text baked into every emitted asset (C1).
    disclosure_label_text: str = "AI · SYNTHETIC"

    # Celery / Redis (interfaces only in this scaffold).
    broker_url: str = "redis://localhost:6379/0"
    result_backend: str = "redis://localhost:6379/1"


@lru_cache
def get_settings() -> Settings:
    s = get_settings_uncached()
    s.storage_dir.mkdir(parents=True, exist_ok=True)
    return s


def get_settings_uncached() -> Settings:
    return Settings()
