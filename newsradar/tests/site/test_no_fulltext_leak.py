"""The rights gate: walk every /site/ and /p/ route at all three content-rights
tiers and assert no body/oversized-extract/translated-body ever leaks."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_session
from newsradar.api.main import app
from newsradar.db.models import ContentRights, ShareScope, Translation, TranslationField
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import TranslationBatchOut
from newsradar.pipeline.normalize import EXTRACT_OK_MAX_CHARS, LINK_ONLY_MAX_CHARS
from newsradar.site.edition import build_edition
from newsradar.site.sharelinks import create_share_link
from newsradar.translate.service import content_hash
from tests.site import _edition_factory as ef

RAW_BODY_SENTINEL = "RAW_BODY_LEAK_SENTINEL"  # only in non-full_ok bodies; must never appear
ROGUE_TRANSLATED_BODY = "ROGUE_TRANSLATED_BODY_SENTINEL"  # planted for non-full_ok; must not leak
FULLOK_BODY = "FULLOK_BODY_ALLOWED"  # full_ok body text — legitimately served

_TIERS = [
    (ContentRights.link_only, LINK_ONLY_MAX_CHARS),
    (ContentRights.extract_ok, EXTRACT_OK_MAX_CHARS),
    (ContentRights.full_ok, EXTRACT_OK_MAX_CHARS),
]


def _translate_responder(purpose: str, user: str, response_model: type) -> TranslationBatchOut:
    payload = json.loads(user)
    return TranslationBatchOut(
        documents=[
            {
                "doc_index": p["doc_index"],
                "source_lang": "he",
                **{f: "EN " + str(v) for f, v in p.items() if f in ("title", "extract", "body")},
            }
            for p in payload
        ]
    )


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


async def _seed(session: AsyncSession) -> dict[str, ContentRights]:
    """One document story per tier, each with a raw body and (adversarially) a
    cached body translation, so the serializer's guard is genuinely tested."""

    interest = await ef.make_interest(session, "world")
    doc_rights: dict[str, ContentRights] = {}
    for rights, _cap in _TIERS:
        src = await ef.make_source(session, f"{rights.value}.co.il", rights=rights, lang="he")
        # full_ok legitimately serves a translated body, so its body text is a
        # separate, allowed sentinel; non-full_ok bodies carry the leak sentinel.
        body_text = FULLOK_BODY if rights == ContentRights.full_ok else RAW_BODY_SENTINEL
        doc = await ef.f.make_document(
            session,
            src,
            title="כותרת בעברית",
            summary="ת" * 800,  # long extract to exercise the cap
            body=body_text + " גוף",
            lang="he",
            published_at=ef.NOW - dt.timedelta(hours=1),
        )
        await ef.add_interest_match(session, doc.id, interest)
        doc_rights[str(doc.id)] = rights
    await session.commit()

    await build_edition(
        session, FakeLLMClient(_translate_responder), now=ef.NOW, size=60, generate_blurbs=False
    )

    # Adversarial: plant a cached BODY translation for the NON-full_ok tiers (where
    # build_edition intentionally created none). The serializer must never emit it.
    for doc_id, rights in doc_rights.items():
        if rights == ContentRights.full_ok:
            continue
        session.add(
            Translation(
                document_id=doc_id,
                target_lang="en",
                field=TranslationField.body,
                source_lang="he",
                text=ROGUE_TRANSLATED_BODY,
                model="claude-haiku-4-5-20251001",
                content_hash=content_hash(ROGUE_TRANSLATED_BODY + doc_id),
            )
        )
    await session.commit()
    return doc_rights


def _assert_story_clean(story: dict, doc_rights: dict[str, ContentRights]) -> None:
    rights = doc_rights.get(str(story["id"]))
    # Attribution gate.
    assert story["source_name"], "empty source_name"
    assert story["url"].startswith("http"), f"non-absolute url {story['url']!r}"

    # Extract cap by tier.
    if story.get("extract_en"):
        cap = (
            EXTRACT_OK_MAX_CHARS
            if rights == ContentRights.full_ok
            else (
                LINK_ONLY_MAX_CHARS if rights == ContentRights.link_only else EXTRACT_OK_MAX_CHARS
            )
        )
        assert len(story["extract_en"]) <= cap

    # Body only for full_ok; never a rogue translated body otherwise.
    if rights == ContentRights.full_ok:
        pass  # body_en allowed
    else:
        assert not story.get("body_en"), f"body leaked for {rights}"


def _assert_text_no_leak(text: str) -> None:
    assert RAW_BODY_SENTINEL not in text, "raw body leaked into a response"
    assert ROGUE_TRANSLATED_BODY not in text, "rogue translated body leaked into a response"


@pytest.mark.asyncio
async def test_no_fulltext_leak_across_all_routes(
    client: AsyncClient, session: AsyncSession
) -> None:
    doc_rights = await _seed(session)
    share = await create_share_link(session, scope=ShareScope.site)
    hdr = {"x-forwarded-for": "10.5.0.1"}

    # Collect story payloads from every story-bearing route, private and public.
    stories: list[dict] = []
    raw_texts: list[str] = []

    r = await client.get("/site/edition/current")
    assert r.status_code == 200
    raw_texts.append(r.text)
    edition = r.json()
    stories += [it["story"] for it in edition["items"]]

    r = await client.get(f"/site/editions/{edition['id']}")
    assert r.status_code == 200
    raw_texts.append(r.text)

    for it in edition["items"]:
        s = it["story"]
        r = await client.get(f"/site/story/{s['story_type']}/{s['id']}")
        assert r.status_code == 200
        raw_texts.append(r.text)
        stories.append(r.json())

    # Public routes.
    r = await client.get(f"/p/{share.token}", headers=hdr)
    assert r.status_code == 200
    raw_texts.append(r.text)
    pub = r.json()
    stories += [it["story"] for it in pub["items"]]

    for it in pub["items"]:
        s = it["story"]
        r = await client.get(f"/p/{share.token}/story/{s['story_type']}/{s['id']}", headers=hdr)
        assert r.status_code == 200
        raw_texts.append(r.text)
        stories.append(r.json())

    # Feeds (both site and public) must not leak either.
    for path in ("/site/feed.rss", "/site/feed.atom", "/site/feed.json"):
        r = await client.get(path)
        assert r.status_code == 200
        raw_texts.append(r.text)
    for path in ("feed.rss", "feed.atom", "feed.json"):
        r = await client.get(f"/p/{share.token}/{path}", headers=hdr)
        assert r.status_code == 200
        raw_texts.append(r.text)

    # Every story payload obeys the rights + attribution gates.
    assert stories
    for story in stories:
        _assert_story_clean(story, doc_rights)

    # No route's raw text ever contains a raw body or a rogue translated body
    # (except full_ok's legitimately translated body, which uses a different text).
    full_ok_body_present = any(
        FULLOK_BODY in (s.get("body_en") or "")
        for s in stories
        if doc_rights.get(str(s["id"])) == ContentRights.full_ok
    )
    assert full_ok_body_present, "full_ok body should be served"
    for text in raw_texts:
        _assert_text_no_leak(text)
