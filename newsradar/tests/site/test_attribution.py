"""Attribution gate + site API: every story has source_name + external url;
non-English outlets surface source_lang != en with a populated headline_original."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_report_llm, get_session
from newsradar.api.main import app
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import TranslationBatchOut
from tests.site import _edition_factory as ef


def _translate(purpose: str, user: str, response_model: type) -> TranslationBatchOut:
    payload = json.loads(user)
    docs = []
    for p in payload:
        combined = " ".join(str(v) for k, v in p.items() if k != "doc_index")
        lang = (
            "he"
            if any("֐" <= c <= "׿" for c in combined)
            else ("ar" if any("؀" <= c <= "ۿ" for c in combined) else "en")
        )
        docs.append(
            {
                "doc_index": p["doc_index"],
                "source_lang": lang,
                **{f: "EN " + str(v) for f, v in p.items() if f in ("title", "extract", "body")},
            }
        )
    return TranslationBatchOut(documents=docs)


@pytest_asyncio.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    await ef.reset(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    app.dependency_overrides[get_report_llm] = lambda: FakeLLMClient(_translate)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _seed(session: AsyncSession) -> None:
    interest = await ef.make_interest(session, "world")
    he = await ef.make_source(session, "haaretz.co.il", lang="he", country_code="IL")
    ar = await ef.make_source(session, "aljazeera.net", lang="ar", country_code="QA")
    en = await ef.make_source(session, "reuters.com", lang="en", country_code="GB")
    for src, title, lang in (
        (he, "כותרת בעברית", "he"),
        (ar, "عنوان بالعربية", "ar"),
        (en, "An English headline", "en"),
    ):
        doc = await ef.f.make_document(
            session,
            src,
            title=title,
            summary="s",
            lang=lang,
            published_at=ef.NOW - dt.timedelta(hours=1),
        )
        await ef.add_interest_match(session, doc.id, interest)
    await session.commit()


@pytest.mark.asyncio
async def test_refresh_then_attribution_on_every_route(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed(session)

    # Build the edition via the API (uses the injected fake translation LLM).
    r = await client.post("/site/refresh")
    assert r.status_code == 201
    assert r.json()["item_count"] == 3

    r = await client.get("/site/edition/current")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 3

    langs = set()
    for it in items:
        s = it["story"]
        # Attribution gate on every story.
        assert s["source_name"], "empty source_name"
        parsed = urlparse(s["url"])
        assert parsed.scheme in ("http", "https") and parsed.hostname
        assert parsed.hostname != "test", "url must point at the original article"
        # English headline always present + a reason.
        assert s["headline_en"].startswith("EN ") or s["source_lang"] == "en"
        assert s["reason"]
        langs.add(s["source_lang"])
        if s["source_lang"] != "en":
            assert s["headline_original"], "non-English story must keep the original headline"

    assert {"he", "ar"} <= langs  # the Hebrew and Arabic outlets are represented


@pytest.mark.asyncio
async def test_share_link_crud_and_revoke(client: AsyncClient, session: AsyncSession) -> None:
    await _seed(session)
    await client.post("/site/refresh")

    r = await client.post("/share-links", json={"scope": "site", "label": "colleague"})
    assert r.status_code == 201
    link = r.json()
    assert len(link["token"]) == 43
    assert link["url"] == f"/p/{link['token']}"

    r = await client.get("/share-links")
    assert r.status_code == 200 and len(r.json()) == 1

    # Colleague opens it (public, no auth) — same stories.
    r = await client.get(f"/p/{link['token']}", headers={"x-forwarded-for": "10.7.0.1"})
    assert r.status_code == 200 and r.json()["item_count"] == 3

    # Revoke -> 410.
    r = await client.post(f"/share-links/{link['id']}/revoke")
    assert r.status_code == 200 and r.json()["revoked_at"] is not None
    r = await client.get(f"/p/{link['token']}", headers={"x-forwarded-for": "10.7.0.2"})
    assert r.status_code == 410
