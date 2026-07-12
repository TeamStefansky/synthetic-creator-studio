"""Brand Watch threat-score engine + endpoint (Phase A)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import security
from app.main import app
from app.pipeline import run_all
from app.threat.engine import compute


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def _open(monkeypatch):
    monkeypatch.setattr(security.settings, "api_keys", "", raising=False)
    security._buckets.clear()


def test_threat_engine_scopes_to_entity(db):
    # Ingest mock sources tagged to an entity, run analysis, then score.
    run_all(db, query="acme", entity="ACME")
    result = compute(db, "ACME")
    assert result["entity"] == "ACME"
    assert result["total_posts"] > 0
    assert 0 <= result["threat_score"] <= 100
    assert result["status"] in ("CALM", "ELEVATED", "UNDER_ATTACK")
    assert result["signals"], "should return a per-signal breakdown"
    assert {s["key"] for s in result["signals"]} >= {"coordination", "inauthentic"}
    # Coordination signal must fire: the mock X fixture has identical bot posts.
    coord = next(s for s in result["signals"] if s["key"] == "coordination")
    assert coord["score"] > 0


def test_unknown_entity_is_calm_and_empty(db):
    result = compute(db, "NeverSeen")
    assert result["total_posts"] == 0
    assert result["threat_score"] == 0
    assert result["status"] == "CALM"


def test_brandwatch_endpoint(client, monkeypatch):
    _open(monkeypatch)
    r = client.get("/api/brandwatch", params={"entity": "ACME"})
    assert r.status_code == 200
    body = r.json()
    assert body["entity"] == "ACME"
    assert "threat_score" in body and "signals" in body and "evidence" in body
    assert body["total_posts"] > 0


def test_brandwatch_requires_min_length(client, monkeypatch):
    _open(monkeypatch)
    assert client.get("/api/brandwatch", params={"entity": "a"}).status_code == 422
