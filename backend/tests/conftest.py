"""Test fixtures.

We point the app at an isolated temp SQLite DB + temp storage dir BEFORE any
app module is imported, so the cached settings/engine bind to the sandbox.
"""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import pytest

# Configure env before importing app.* (config + engine bind at import time).
_TMP = Path(tempfile.mkdtemp(prefix="scs_test_"))
os.environ["SCS_DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["SCS_STORAGE_DIR"] = str(_TMP / "storage")
os.environ["SCS_PROVENANCE_SIGNING_KEY"] = "test-signing-key"
# Hermetic defaults — never pick up a developer's local .env (e.g. KREA keys).
os.environ["SCS_GENERATION_PROVIDER"] = "stub"
os.environ["SCS_PROVENANCE_BACKEND"] = "hmac"
os.environ["SCS_KREA_API_KEY"] = ""

from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base  # noqa: E402
from app.services.entities import create_responsible_entity  # noqa: E402
from app.services.personas import create_persona  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def session():
    s = SessionLocal()
    try:
        yield s
        s.rollback()
    finally:
        s.close()


@pytest.fixture
def entity(session):
    return create_responsible_entity(
        session, name=f"Acme {uuid.uuid4().hex[:6]}", contact_email="brand@acme.example"
    )


@pytest.fixture
def persona(session, entity):
    return create_persona(
        session,
        responsible_entity_id=entity.id,
        name="Nova",
        backstory="A disclosed virtual brand ambassador.",
        voice_tone="warm, upbeat, clearly AI",
        visual_identity={"base_color": [40, 120, 200], "tags": ["studio", "portrait"]},
    )
