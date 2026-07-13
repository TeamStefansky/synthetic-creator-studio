"""Brand Watch continuous monitoring — watchlist + escalation (Phase B)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import security
from app.main import app
from app.models import ThreatSnapshot, WatchedEntity
from app.watch.service import check_entity, run_all_watched


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def _open(monkeypatch):
    monkeypatch.setattr(security.settings, "api_keys", "", raising=False)
    security._buckets.clear()


def test_watch_crud(client, monkeypatch):
    _open(monkeypatch)
    assert client.get("/api/watch").json() == []
    created = client.post("/api/watch", params={"name": "ACME"}).json()
    assert created["name"] == "ACME" and created["enabled"] is True
    # Idempotent by name.
    again = client.post("/api/watch", params={"name": "ACME"}).json()
    assert again["id"] == created["id"]
    assert len(client.get("/api/watch").json()) == 1
    assert client.delete(f"/api/watch/{created['id']}").json()["deleted"] == created["id"]
    assert client.get("/api/watch").json() == []


def test_check_entity_stores_snapshot_and_updates_status(db):
    we = WatchedEntity(name="ACME")
    db.add(we); db.commit()
    result = check_entity(db, we)
    assert result["entity"] == "ACME"
    assert we.last_status in ("CALM", "ELEVATED", "UNDER_ATTACK")
    assert we.last_checked_at is not None
    snaps = list(db.scalars(select(ThreatSnapshot).where(ThreatSnapshot.entity == "ACME")))
    assert len(snaps) == 1
    assert snaps[0].status == result["status"]


def test_run_all_watched_checks_enabled(db):
    db.add(WatchedEntity(name="ACME"))
    db.add(WatchedEntity(name="Globex", enabled=False))
    db.commit()
    out = run_all_watched(db)
    assert out["checked"] == 1  # only the enabled one


def test_escalation_alert_on_worsening(db):
    # Seed a prior CALM status, then a check that lands higher fires an alert.
    we = WatchedEntity(name="ACME", last_status="CALM")
    db.add(we); db.commit()
    result = check_entity(db, we)
    from app.models import Alert
    escalated = result["status"] != "CALM"
    alerts = list(db.scalars(select(Alert).where(Alert.type == "brandwatch_escalation")))
    assert bool(alerts) == escalated
