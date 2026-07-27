"""document_media extraction: RSS media first, OG fallback, frameability + cache."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import DocumentMedia, DomainFrameability
from newsradar.feeds.http import FetchResult, RecordedFetcher
from newsradar.feeds.media import backfill_media, frameability_from_headers, parse_og
from tests.feeds._recorded import _read
from tests.pipeline import _factories as f

_T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


def test_parse_og() -> None:
    og = parse_og(_read("article_og.html"), "https://example-tech.com/story")
    assert og.og_title == "Quantum-safe encryption goes to pilot"
    assert og.image_url == "https://cdn.example-tech.com/img/quantum-hero.jpg"
    assert og.image_alt == "A server room bathed in blue light"
    assert og.og_site_name == "Example Tech Daily"
    assert og.byline == "Dana Levi"
    assert og.favicon_url == "https://example-tech.com/favicon-32.png"


def test_frameability_from_headers() -> None:
    assert frameability_from_headers({"x-frame-options": "DENY"}) is False
    assert frameability_from_headers({"content-security-policy": "frame-ancestors 'none'"}) is False
    assert frameability_from_headers({"content-security-policy": "frame-ancestors 'self'"}) is False
    assert frameability_from_headers({"content-security-policy": "frame-ancestors *"}) is True
    assert frameability_from_headers({"content-security-policy": "default-src 'self'"}) is True
    assert frameability_from_headers({}) is True


async def _reset(session: AsyncSession) -> None:
    await session.execute(
        text("TRUNCATE document_media, domain_frameability, documents, sources CASCADE")
    )
    await session.commit()


@pytest.mark.asyncio
async def test_rss_media_used_without_fetch(session: AsyncSession) -> None:
    await _reset(session)
    src = await f.make_source(session, "rssmedia.com")
    doc = await f.make_document(
        session,
        src,
        title="With image",
        raw={"media": {"image_url": "https://rssmedia.com/a.jpg", "image_width": 800}},
        published_at=_T0,
    )
    await session.commit()

    fetcher = RecordedFetcher(responses={})
    written = await backfill_media(session, fetcher)
    assert written == 1
    assert fetcher.requests == []  # RSS media needs no network

    media = await session.get(DocumentMedia, doc.id)
    assert media is not None and media.image_url == "https://rssmedia.com/a.jpg"
    assert media.image_width == 800


@pytest.mark.asyncio
async def test_og_fallback_and_frameability_cache(session: AsyncSession) -> None:
    await _reset(session)
    src = await f.make_source(session, "example-tech.com")
    url1 = "https://example-tech.com/story-1"
    url2 = "https://example-tech.com/story-2"
    d1 = await f.make_document(session, src, title="s1", url=url1, published_at=_T0)
    await f.make_document(
        session, src, title="s2", url=url2, published_at=_T0 - dt.timedelta(hours=1)
    )
    await session.commit()

    html = _read("article_og.html")
    headers = {"content-type": "text/html", "x-frame-options": "SAMEORIGIN"}
    responses = {
        url: FetchResult(
            url=url, status_code=200, headers=headers, text=html, content=html.encode()
        )
        for url in (url1, url2)
    }
    fetcher = RecordedFetcher(responses=responses)

    written = await backfill_media(session, fetcher, respect_robots=False)
    assert written == 2

    m1 = await session.get(DocumentMedia, d1.id)
    assert m1 is not None
    assert m1.image_url == "https://cdn.example-tech.com/img/quantum-hero.jpg"
    assert m1.og_site_name == "Example Tech Daily"
    assert m1.byline == "Dana Levi"
    assert m1.frameable is False  # X-Frame-Options set

    # Domain frameability is cached once for the domain.
    cache = (await session.execute(select(DomainFrameability))).scalars().all()
    assert len(cache) == 1 and cache[0].domain == "example-tech.com"


@pytest.mark.asyncio
async def test_robots_disallow_skips_fetch(session: AsyncSession) -> None:
    await _reset(session)
    src = await f.make_source(session, "norobots.com")
    url = "https://norobots.com/story"
    doc = await f.make_document(session, src, title="s", url=url, published_at=_T0)
    await session.commit()

    fetcher = RecordedFetcher(responses={}, robots={"https://norobots.com": False})
    written = await backfill_media(session, fetcher, respect_robots=True)
    assert written == 1
    assert all("story" not in u for u in fetcher.requests)  # no article fetch
    media = await session.get(DocumentMedia, doc.id)
    assert media is not None and media.image_url is None
