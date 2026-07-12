"""Keyword search endpoint (Stage 8): /api/search ingests all sources for a
query then runs the full analysis pipeline."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import security
from app.main import app


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def _open(monkeypatch):
    monkeypatch.setattr(security.settings, "api_keys", "", raising=False)
    security._buckets.clear()


def test_search_runs_full_pipeline(client, monkeypatch):
    _open(monkeypatch)
    r = client.post("/api/search", params={"query": "election fraud"})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "election fraud"
    # Mock sources (x/telegram/…) ingested; analysis stages populated.
    assert "ingest" in body and body["ingest"]
    assert body["authenticity"]["authors"] >= 1
    # The mock X fixture contains two coordinated bot posts → a campaign.
    assert body["coordination"]["campaigns"] >= 1
    # Data is now queryable through the read endpoints.
    assert client.get("/api/campaigns").json()
    assert client.get("/api/narratives").json()


def test_search_requires_min_length(client, monkeypatch):
    _open(monkeypatch)
    assert client.post("/api/search", params={"query": "a"}).status_code == 422
