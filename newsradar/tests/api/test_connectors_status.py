"""``GET /connectors/status`` endpoint."""

from __future__ import annotations

import datetime as dt

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import HealthStatus
from newsradar.connectors.gdelt import GdeltConnector
from newsradar.connectors.rss import RssConnector
from newsradar.db.models import IngestionRun


@pytest.mark.asyncio
async def test_connectors_status(session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    # Avoid real network in health checks for the two enabled connectors.
    async def _ok(self: object) -> HealthStatus:
        return HealthStatus(healthy=True, detail="stub")

    monkeypatch.setattr(GdeltConnector, "health_check", _ok)
    monkeypatch.setattr(RssConnector, "health_check", _ok)

    # A prior successful GDELT run so last_run_at is populated.
    session.add(
        IngestionRun(
            connector="gdelt",
            status="ok",
            fetched=10,
            inserted=8,
            duplicates=2,
            errors=0,
            started_at=dt.datetime(2026, 7, 20, tzinfo=dt.UTC),
        )
    )
    await session.commit()

    from newsradar.api.main import app

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/connectors/status")

    assert resp.status_code == 200
    connectors = {c["name"]: c for c in resp.json()["connectors"]}
    assert set(connectors) == {"gdelt", "rss", "telegram", "youtube", "perigon"}

    assert connectors["gdelt"]["enabled"] is True
    assert connectors["gdelt"]["healthy"] is True
    assert connectors["gdelt"]["last_run_at"] is not None
    assert connectors["rss"]["enabled"] is True

    # No credentials in the test environment -> these are disabled.
    assert connectors["telegram"]["enabled"] is False
    assert connectors["youtube"]["enabled"] is False
    assert connectors["perigon"]["enabled"] is False
