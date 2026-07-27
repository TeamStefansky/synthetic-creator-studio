"""Share gates: valid/revoked/expired tokens, rate limit, and external-link feeds."""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_session
from newsradar.api.main import app
from newsradar.db.models import ShareScope
from newsradar.llm.client import FakeLLMClient
from newsradar.site.edition import build_edition
from newsradar.site.sharelinks import create_share_link, revoke_share_link
from tests.site import _edition_factory as ef


def _no_llm(purpose: str, user: str, response_model: type) -> object:
    raise AssertionError(f"unexpected LLM call for {purpose}")


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    await ef.reset(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _seed_edition(session: AsyncSession) -> None:
    interest = await ef.make_interest(session, "world")
    for sidx in range(6):
        src = await ef.make_source(session, f"outlet{sidx}.com", tier=2, country_code="US")
        doc = await ef.f.make_document(
            session,
            src,
            title=f"Story {sidx}",
            summary=f"Extract {sidx}",
            lang="en",
            published_at=ef.NOW - dt.timedelta(hours=sidx + 1),
        )
        await ef.add_interest_match(session, doc.id, interest)
    await session.commit()
    await build_edition(session, FakeLLMClient(_no_llm), now=ef.NOW, size=60, generate_blurbs=False)


@pytest.mark.asyncio
async def test_valid_revoked_expired(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_edition(session)
    link = await create_share_link(session, scope=ShareScope.site, label="my share")

    r = await client.get(f"/p/{link.token}", headers={"x-forwarded-for": "10.1.0.1"})
    assert r.status_code == 200
    assert r.json()["item_count"] == 6

    # Revoked -> 410
    await revoke_share_link(session, link.id)
    r = await client.get(f"/p/{link.token}", headers={"x-forwarded-for": "10.1.0.2"})
    assert r.status_code == 410

    # Expired -> 410
    expired = await create_share_link(
        session,
        scope=ShareScope.site,
        expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(hours=1),
    )
    r = await client.get(f"/p/{expired.token}", headers={"x-forwarded-for": "10.1.0.3"})
    assert r.status_code == 410

    # Unknown token -> 404
    r = await client.get("/p/" + "z" * 43, headers={"x-forwarded-for": "10.1.0.4"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_rate_limit_429_on_61st(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_edition(session)
    link = await create_share_link(session, scope=ShareScope.site)
    ip = "10.9.9.9"

    statuses = [
        (await client.get(f"/p/{link.token}", headers={"x-forwarded-for": ip})).status_code
        for _ in range(60)
    ]
    assert all(s == 200 for s in statuses)
    r = await client.get(f"/p/{link.token}", headers={"x-forwarded-for": ip})
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_feeds_link_to_external_articles(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_edition(session)
    link = await create_share_link(session, scope=ShareScope.site)
    hdr = {"x-forwarded-for": "10.2.0.1"}

    # RSS 2.0
    r = await client.get(f"/p/{link.token}/feed.rss", headers=hdr)
    assert r.status_code == 200
    root = ET.fromstring(r.text)
    assert root.tag == "rss" and root.get("version") == "2.0"
    item_links = [el.text for el in root.iter("link")]
    assert item_links, "expected feed links"
    for href in item_links:
        host = urlparse(href or "").hostname or ""
        assert host and host != "test", f"internal link leaked: {href}"

    # Atom
    r = await client.get(f"/p/{link.token}/feed.atom", headers=hdr)
    assert r.status_code == 200
    atom = ET.fromstring(r.text)
    for el in atom.iter("{http://www.w3.org/2005/Atom}link"):
        host = urlparse(el.get("href") or "").hostname or ""
        assert host and host != "test"

    # JSON Feed 1.1
    r = await client.get(f"/p/{link.token}/feed.json", headers=hdr)
    assert r.status_code == 200
    feed = r.json()
    assert feed["version"] == "https://jsonfeed.org/version/1.1"
    assert feed["items"]
    for item in feed["items"]:
        host = urlparse(item["url"]).hostname or ""
        assert host and host != "test"
