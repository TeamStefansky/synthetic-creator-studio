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

    # Provenance backend: "hmac" (default, zero-infra, verifiable signed manifest)
    # or "c2pa" (real Content Credentials embedded in image bytes via c2pa-python).
    provenance_backend: str = "hmac"
    # Optional PEM paths for C2PA signing in production (cert chain + private key).
    # If unset, the C2PA backend generates a cached dev CA/leaf under storage_dir.
    c2pa_cert_path: Path | None = None
    c2pa_key_path: Path | None = None
    # Strict mode requires c2pa's overall validation_state == "Valid" at the gate.
    # The prebuilt 0.32.x wheel used in dev mis-reports claimSignature on some
    # platforms, so dev defaults to integrity+trust+AI-assertion checks instead.
    c2pa_require_valid_state: bool = False

    # Generation provider: "stub" (CPU, deterministic) or "diffusion" (GPU; needs torch+diffusers).
    generation_provider: str = "stub"

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
