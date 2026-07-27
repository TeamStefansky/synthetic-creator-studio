"""Interests API: create with description embedding, subject-country preview gate."""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_embedder, get_session
from newsradar.api.main import app
from newsradar.db.models import DocumentEnrichment, Source
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from tests.pipeline import _factories as f

_T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    await f.reset(session)

    async def _override_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_embedder] = lambda: HashingEmbedder()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _seed_docs(session: AsyncSession) -> None:
    src = await f.make_source(session, "wire.com")
    await session.execute(update(Source).where(Source.id == src.id).values(country_code="GB"))
    ua = await f.make_document(
        session,
        src,
        title="Ukraine grain exports resume through the Black Sea corridor",
        body="Ukraine and Poland coordinate grain exports through the corridor.",
        published_at=_T0,
    )
    other = await f.make_document(
        session,
        src,
        title="Australian rugby final draws record crowd",
        body="The rugby final in Australia set an attendance record.",
        published_at=_T0 - dt.timedelta(hours=1),
    )
    await session.commit()
    await embed_documents(session, HashingEmbedder())
    await session.execute(
        update(DocumentEnrichment)
        .where(DocumentEnrichment.document_id == ua.id)
        .values(geo={"country_code": "UA"})
    )
    await session.execute(
        update(DocumentEnrichment)
        .where(DocumentEnrichment.document_id == other.id)
        .values(geo={"country_code": "AU"})
    )
    await session.commit()


@pytest.mark.asyncio
async def test_create_interest_and_preview_subject_country(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_docs(session)

    r = await client.post(
        "/interests",
        json={
            "name": "eastern-europe-grain",
            "description": "grain exports through the Black Sea corridor",
            "keywords": ["grain"],
            "subject_countries": ["UA", "PL"],
            "country_match_mode": "subject",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["has_embedding"] is True
    assert body["keywords"] == ["grain"]
    assert body["country_match_mode"] == "subject"
    interest_id = body["id"]

    session.expire_all()
    r = await client.get(f"/interests/{interest_id}/preview", params={"limit": 10})
    assert r.status_code == 200
    items = r.json()
    assert items, "expected at least one matching document"
    # subject mode with UA/PL -> only the Ukraine story, never the Australia one.
    assert all(it["subject_country"] in {"UA", "PL"} for it in items)
    assert all("rugby" not in (it["title"] or "").lower() for it in items)


@pytest.mark.asyncio
async def test_interest_country_code_validation(client: AsyncClient) -> None:
    r = await client.post(
        "/interests",
        json={"name": "bad", "description": "x", "subject_countries": ["Ukraine"]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_interest_crud(client: AsyncClient) -> None:
    r = await client.post("/interests", json={"name": "tech", "description": "gadgets"})
    interest_id = r.json()["id"]

    r = await client.get("/interests")
    assert r.status_code == 200 and r.json()["total"] == 1

    r = await client.patch(
        f"/interests/{interest_id}",
        json={"keywords": ["ai", "chips"], "min_semantic_similarity": 0.6},
    )
    assert r.status_code == 200
    assert sorted(r.json()["keywords"]) == ["ai", "chips"]
    assert r.json()["min_semantic_similarity"] == 0.6

    r = await client.delete(f"/interests/{interest_id}")
    assert r.status_code == 204
    r = await client.get(f"/interests/{interest_id}")
    assert r.status_code == 404
