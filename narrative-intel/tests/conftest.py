"""Test fixtures: a fresh in-memory-ish SQLite DB per test via create_all."""
from __future__ import annotations

import os
import tempfile

import pytest

# Use a temp SQLite file BEFORE importing app modules (settings reads env).
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"


@pytest.fixture()
def db():
    from app.db import Base, SessionLocal, engine
    from app import models  # noqa: F401  (register tables)

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
