"""Sources API: rights gate (422), batch default-safety, discover, feeds CRUD."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_batch_dispatch, get_fetcher, get_session
from newsradar.api.main import app
from newsradar.db.session import get_sessionmaker
from newsradar.feeds.batch import process_batch
from tests.feeds._recorded import recorded

_BATCH_FIXTURES = {
    "https://theverge.com/": "theverge_home.html",
    "https://theverge.com/rss/index.xml": "rss_generic.xml",
    "https://techcrunch.com/": "techcrunch_home.html",
    "https://techcrunch.com/feed": "techcrunch_rss.xml",
    "https://acme-widgets.example/": "nofeed_home.html",
}


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    await session.execute(
        text(
            "TRUNCATE source_import_results, source_import_jobs, feed_subscriptions, "
            "api_sources, documents, sources CASCADE"
        )
    )
    await session.commit()

    async def _override_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def _inline_dispatch(job_id: uuid.UUID, lines: list[str]) -> None:
        await process_batch(
            get_sessionmaker(), job_id, lines, fetcher=recorded(_BATCH_FIXTURES), concurrency=4
        )

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_batch_dispatch] = lambda: _inline_dispatch
    app.dependency_overrides[get_fetcher] = lambda: recorded(_BATCH_FIXTURES)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_rights_upgrade_requires_note(client: AsyncClient) -> None:
    r = await client.post("/sources", json={"name": "Example", "domain": "example.com"})
    assert r.status_code == 201
    src = r.json()
    assert src["content_rights"] == "link_only"  # never inferred
    source_id = src["id"]

    # Upgrade to full_ok WITHOUT a note -> 422.
    r = await client.patch(f"/sources/{source_id}/rights", json={"content_rights": "full_ok"})
    assert r.status_code == 422

    # Upgrade to full_ok WITH a note -> 200.
    r = await client.patch(
        f"/sources/{source_id}/rights",
        json={"content_rights": "full_ok", "rights_note": "licensed wire, email 2026-03-11"},
    )
    assert r.status_code == 200
    assert r.json()["content_rights"] == "full_ok"
    assert r.json()["rights_note"].startswith("licensed wire")


@pytest.mark.asyncio
async def test_batch_default_safety(client: AsyncClient, session: AsyncSession) -> None:
    r = await client.post(
        "/sources/batch",
        json={"text": "theverge.com\ntheverge.com\ntechcrunch.com\nacme-widgets.example\nhttp://"},
    )
    assert r.status_code == 202
    job_id = r.json()["id"]

    session.expire_all()
    r = await client.get(f"/sources/batch/{job_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "done"
    statuses = sorted(x["status"] for x in body["results"])
    assert statuses == ["added", "added", "duplicate", "invalid", "no_feed"]

    # Default-safety: every batch-created source is link_only.
    r = await client.get("/sources")
    assert r.status_code == 200
    sources = r.json()["items"]
    assert sources and all(s["content_rights"] == "link_only" for s in sources)


@pytest.mark.asyncio
async def test_discover_endpoint(client: AsyncClient) -> None:
    r = await client.post("/feeds/discover", json={"url": "theverge.com"})
    assert r.status_code == 200
    feeds = r.json()
    assert feeds and feeds[0]["feed_url"] == "https://theverge.com/rss/index.xml"


@pytest.mark.asyncio
async def test_feeds_crud_and_health(client: AsyncClient) -> None:
    r = await client.post(
        "/feeds", json={"feed_url": "https://blog.example/feed.xml", "title": "Blog"}
    )
    assert r.status_code == 201
    feed_id = r.json()["id"]

    # Duplicate feed -> 409.
    r = await client.post("/feeds", json={"feed_url": "https://blog.example/feed.xml"})
    assert r.status_code == 409

    r = await client.patch(f"/feeds/{feed_id}", json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False

    r = await client.get("/feeds/health")
    assert r.status_code == 200
    assert any(h["feed_url"] == "https://blog.example/feed.xml" for h in r.json())

    r = await client.delete(f"/feeds/{feed_id}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_api_sources_crud(client: AsyncClient) -> None:
    r = await client.post(
        "/api-sources",
        json={"provider": "gdelt", "name": "latam", "country_filter": ["br", "ar"]},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["country_filter"] == ["BR", "AR"]  # normalised to upper-case ISO
    api_id = body["id"]

    r = await client.patch(f"/api-sources/{api_id}", json={"enabled": False})
    assert r.status_code == 200 and r.json()["enabled"] is False

    r = await client.get("/api-sources")
    assert r.status_code == 200 and r.json()["total"] == 1

    # Bad country code rejected at the schema level.
    r = await client.post(
        "/api-sources", json={"provider": "gdelt", "name": "bad", "country_filter": ["BRA"]}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_opml_round_trip_via_api(client: AsyncClient) -> None:
    opml = (
        '<?xml version="1.0"?><opml version="2.0"><body>'
        '<outline text="News" title="News">'
        '<outline type="rss" title="A" xmlUrl="https://a.example/feed"/>'
        "</outline></body></opml>"
    )
    r = await client.post("/feeds/import-opml", json={"opml": opml})
    assert r.status_code == 200 and r.json()["imported"] == 1

    r = await client.get("/feeds/export-opml")
    assert r.status_code == 200
    assert "https://a.example/feed" in r.text
