"""P3 API: watchlists/events/trends/geo/reports/schedules/alerts + ad-hoc generate."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_report_llm, get_session
from newsradar.api.main import app
from newsradar.llm.client import FakeLLMClient
from tests.reports.test_builder import NOW, _seed
from tests.reports.test_renderer import _responder


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_report_llm] = lambda: FakeLLMClient(_responder)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_watchlists_events_trends_geo(client: AsyncClient, session: AsyncSession) -> None:
    wl, ev, _entity = await _seed(session)

    r = await client.get("/watchlists")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1 and any(w["id"] == str(wl.id) for w in body["items"])

    r = await client.get(f"/watchlists/{wl.id}/events", params={"min_heat": 50})
    assert r.status_code == 200
    events = r.json()["items"]
    assert events and events[0]["id"] == str(ev.id)
    assert events[0]["heat_score"] >= 50

    r = await client.get(f"/watchlists/{wl.id}/trends")
    assert r.status_code == 200
    assert any(t["term"] == "corruption" for t in r.json()["items"])

    # Geo uses wall-clock now (production behavior); assert the endpoint shape.
    # The hot-zone math itself is covered deterministically in tests/signals/test_geo.py.
    r = await client.get(f"/watchlists/{wl.id}/geo")
    assert r.status_code == 200
    assert set(r.json()) == {"hot_zones", "country_breakdown"}


@pytest.mark.asyncio
async def test_event_detail(client: AsyncClient, session: AsyncSession) -> None:
    _wl, ev, entity = await _seed(session)
    r = await client.get(f"/events/{ev.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(ev.id)
    assert body["documents"] and body["stance"]
    assert any(s["entity_id"] == str(entity.id) and s["stance"] < 0 for s in body["stance"])

    # 404 for an unknown event.
    import uuid

    assert (await client.get(f"/events/{uuid.uuid4()}")).status_code == 404


@pytest.mark.asyncio
async def test_generate_report_end_to_end(client: AsyncClient, session: AsyncSession) -> None:
    wl, ev, _entity = await _seed(session)

    r = await client.post(
        "/reports/generate",
        json={
            "watchlist_id": str(wl.id),
            "lookback_hours": 24,
            "sections": ["overview", "hot_events", "trends", "negative_coverage", "geo"],
        },
    )
    assert r.status_code == 201
    report_id = r.json()["id"]

    # GET the report: Hebrew markdown, and every referenced event id is real.
    r = await client.get(f"/reports/{report_id}")
    assert r.status_code == 200
    detail = r.json()
    assert "אירועים חמים" in detail["markdown"]
    assert str(ev.id) in detail["event_ids"]

    # It shows up in the list.
    r = await client.get("/reports", params={"watchlist_id": str(wl.id)})
    assert any(item["id"] == report_id for item in r.json()["items"])


@pytest.mark.asyncio
async def test_report_schedule_crud(client: AsyncClient, session: AsyncSession) -> None:
    wl, _ev, _entity = await _seed(session)

    r = await client.post(
        "/report-schedules",
        json={
            "watchlist_id": str(wl.id),
            "name": "daily",
            "cron": "0 7 * * *",
            "timezone": "Asia/Jerusalem",
            "sections": ["overview", "hot_events"],
            "format": "pdf",
            "lookback_hours": 24,
        },
    )
    assert r.status_code == 201
    sched_id = r.json()["id"]

    r = await client.patch(f"/report-schedules/{sched_id}", json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False

    r = await client.get("/report-schedules")
    assert any(s["id"] == sched_id for s in r.json()["items"])


@pytest.mark.asyncio
async def test_alerts_endpoint(client: AsyncClient, session: AsyncSession) -> None:
    wl, ev, _entity = await _seed(session)
    from newsradar.signals.rules import heat_spike, record_alert

    await record_alert(
        session, heat_spike(event_id=ev.id, current_heat=90.0, prev_heat=10.0), now=NOW
    )

    r = await client.get("/alerts", params={"severity": "critical", "watchlist_id": str(wl.id)})
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and items[0]["severity"] == "critical"
    assert items[0]["event_id"] == str(ev.id)
