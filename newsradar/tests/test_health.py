"""``/health`` endpoint test — really pings Postgres and Redis."""

from __future__ import annotations

import httpx
import pytest
from httpx import ASGITransport

from newsradar.api.main import app


@pytest.mark.asyncio
async def test_health_all_ok(migrated_database: None) -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "db": "ok", "redis": "ok"}
