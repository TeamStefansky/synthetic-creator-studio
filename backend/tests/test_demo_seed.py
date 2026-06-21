"""In-process demo seeder used by hosted demos (SCS_SEED_DEMO=1).

Uses an isolated SQLite database so the emptiness guard is meaningful (the
shared suite DB already has rows committed by other tests).
"""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.demo_seed import seed_if_empty
from app.models import Base
from app.models.asset import Asset, DisclosureStatus
from app.models.persona import Persona
from app.models.post import ApprovalState, Post


@pytest.fixture
def fresh_session():
    path = Path(tempfile.mkdtemp(prefix="scs_seed_")) / f"{uuid.uuid4().hex}.db"
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.cursor().execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    try:
        yield s
    finally:
        s.close()
        engine.dispose()


def test_seed_if_empty_populates_disclosed_demo(fresh_session):
    assert seed_if_empty(fresh_session) is True

    personas = fresh_session.query(Persona).all()
    assert len(personas) == 3
    # Every persona has its required synthetic identity (C3).
    assert all(p.synthetic_identity and p.synthetic_identity.ai_generated for p in personas)

    # Every generated asset is disclosed (tagged) — never pending/blocked (C1).
    assets = fresh_session.query(Asset).all()
    assert assets and all(a.disclosure_status == DisclosureStatus.TAGGED for a in assets)

    # Published posts went through the hard gate.
    published = fresh_session.query(Post).filter(Post.approval_state == ApprovalState.PUBLISHED).all()
    assert published and all(p.external_post_id for p in published)


def test_seed_is_idempotent(fresh_session):
    assert seed_if_empty(fresh_session) is True
    assert seed_if_empty(fresh_session) is False  # second call is a no-op
