"""Reports + public-API guards (Stage 7).

Exercises the report generator (HTML/JSON) end-to-end through the API, plus the
optional API-key auth and rate limiter.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import security
from app.coordination.engine import detect_campaigns
from app.ingest.service import ingest_source
from app.main import app
from app.narratives.engine import run as run_narratives


@pytest.fixture()
def client(db):
    # Seed data through the same SQLite file the app's get_session() uses.
    ingest_source(db, "x")
    ingest_source(db, "telegram")
    detect_campaigns(db)
    run_narratives(db)
    db.commit()
    with TestClient(app) as c:
        yield c


def _reset_guards(monkeypatch):
    monkeypatch.setattr(security.settings, "api_keys", "", raising=False)
    security._buckets.clear()


def test_campaign_report_html(client, monkeypatch):
    _reset_guards(monkeypatch)
    cid = client.get("/api/campaigns").json()[0]["id"]
    r = client.get(f"/api/report/campaign/{cid}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "Executive summary" in r.text
    assert "Coordination score" in r.text


def test_campaign_report_json(client, monkeypatch):
    _reset_guards(monkeypatch)
    cid = client.get("/api/campaigns").json()[0]["id"]
    r = client.get(f"/api/report/campaign/{cid}?format=json")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "campaign"
    assert body["recommendations"]
    assert "summary" in body


def test_narrative_report_html(client, monkeypatch):
    _reset_guards(monkeypatch)
    narratives = client.get("/api/narratives").json()
    if not narratives:
        pytest.skip("no narratives produced from fixtures")
    nid = narratives[0]["id"]
    r = client.get(f"/api/report/narrative/{nid}")
    assert r.status_code == 200
    assert "Manipulation index" in r.text


def test_report_404_for_missing(client, monkeypatch):
    _reset_guards(monkeypatch)
    assert client.get("/api/report/campaign/999999").status_code == 404
    assert client.get("/api/report/narrative/999999").status_code == 404


def test_api_key_required_when_configured(client, monkeypatch):
    security._buckets.clear()
    monkeypatch.setattr(security.settings, "api_keys", "secret-1, secret-2", raising=False)
    assert client.get("/api/sources").status_code == 401
    assert client.get("/api/sources", headers={"X-API-Key": "nope"}).status_code == 401
    ok = client.get("/api/sources", headers={"X-API-Key": "secret-1"})
    assert ok.status_code == 200


def test_rate_limit_trips(client, monkeypatch):
    _reset_guards(monkeypatch)
    monkeypatch.setattr(security, "RATE_LIMIT", 5, raising=False)
    codes = [client.get("/api/sources").status_code for _ in range(7)]
    assert codes.count(200) == 5
    assert codes[-1] == 429
