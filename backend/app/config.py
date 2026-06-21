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

    # Generation provider: "stub" | "diffusion" | "krea".
    generation_provider: str = "stub"

    # KREA API (https://krea.ai) — used when generation_provider="krea".
    # The key is read from the environment only; never commit it.
    krea_api_key: str | None = None
    krea_base_url: str = "https://api.krea.ai"
    krea_model: str = "flux_dev"
    # Weight applied to a persona's trained LoRA at generation time.
    krea_lora_weight: float = 1.0
    # id:secret credentials are HTTP Basic by convention.
    krea_auth_scheme: str = "basic"  # bearer | basic | x-api-key
    # KREA Train knobs (mirror the web flow): style|character|object|face, image|video.
    krea_optimize_for: str = "style"
    krea_modality: str = "image"
    krea_timeout_s: float = 120.0

    # When true, seed a small demo dataset on startup if the DB is empty (hosted demos).
    seed_demo: bool = False

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
