"""Feed-subscription creation + conditional polling (ETag/304, failure deactivation)."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import FeedSubscription, Source
from newsradar.feeds.http import FetchResult
from newsradar.feeds.polling import MAX_CONSECUTIVE_FAILURES, poll_subscriptions
from newsradar.feeds.subscriptions import create_subscription
from tests.feeds._recorded import _read

_SINCE = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)


class _ConditionalFetcher:
    """Returns a feed with an ETag; a matching If-None-Match yields 304."""

    def __init__(self, feed_xml: str, etag: str = 'W/"v1"') -> None:
        self.feed_xml = feed_xml
        self.etag = etag
        self.calls = 0

    async def get(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        self.calls += 1
        if headers and headers.get("If-None-Match") == self.etag:
            return FetchResult(url=url, status_code=304, headers={"etag": self.etag}, text="")
        return FetchResult(
            url=url,
            status_code=200,
            headers={"etag": self.etag, "content-type": "application/rss+xml"},
            text=self.feed_xml,
        )

    async def head(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        return await self.get(url, headers)

    async def get_ranged(
        self, url: str, max_bytes: int = 65536, headers: dict[str, str] | None = None
    ) -> FetchResult:
        return await self.get(url, headers)

    async def robots_allowed(self, url: str) -> bool:
        return True

    async def aclose(self) -> None:
        return None


class _FailingFetcher:
    async def get(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        raise ConnectionError("boom")

    async def head(self, url: str, headers: dict[str, str] | None = None) -> FetchResult:
        raise ConnectionError("boom")

    async def get_ranged(
        self, url: str, max_bytes: int = 65536, headers: dict[str, str] | None = None
    ) -> FetchResult:
        raise ConnectionError("boom")

    async def robots_allowed(self, url: str) -> bool:
        return True

    async def aclose(self) -> None:
        return None


async def _reset(session: AsyncSession) -> None:
    await session.execute(text("TRUNCATE feed_subscriptions, documents, sources CASCADE"))
    await session.commit()


@pytest.mark.asyncio
async def test_create_subscription_reuses_source_by_registrable_domain(
    session: AsyncSession,
) -> None:
    await _reset(session)
    a = await create_subscription(session, "https://www.bbc.co.uk/news/rss.xml", title="News")
    b = await create_subscription(session, "https://bbc.co.uk/sport/rss.xml", title="Sport")
    await session.commit()
    assert a.created and b.created
    # Both feeds collapse onto one source (bbc.co.uk).
    assert a.subscription.source_id == b.subscription.source_id
    sources = (await session.execute(select(Source))).scalars().all()
    assert len(sources) == 1 and sources[0].domain == "bbc.co.uk"
    assert str(sources[0].content_rights) == "link_only"

    # A duplicate feed_url is reported, not re-created.
    dup = await create_subscription(session, "https://www.bbc.co.uk/news/rss.xml")
    assert dup.duplicate and not dup.created


@pytest.mark.asyncio
async def test_conditional_polling_304(session: AsyncSession) -> None:
    await _reset(session)
    res = await create_subscription(session, "https://techcrunch.com/feed")
    await session.commit()
    feed_xml = _read("techcrunch_rss.xml")
    fetcher = _ConditionalFetcher(feed_xml)

    docs = await poll_subscriptions(session, fetcher, _SINCE)
    assert len(docs) == 2  # both items are after 2026-01-01
    sub = await session.get(FeedSubscription, res.subscription.id)
    assert sub is not None and sub.etag == 'W/"v1"'
    assert sub.last_ok_at is not None and sub.consecutive_failures == 0

    # Second poll sends If-None-Match -> 304 -> no docs, still healthy.
    docs2 = await poll_subscriptions(session, fetcher, _SINCE)
    assert docs2 == []
    sub = await session.get(FeedSubscription, res.subscription.id)
    assert sub is not None and sub.consecutive_failures == 0


@pytest.mark.asyncio
async def test_failures_auto_deactivate(session: AsyncSession) -> None:
    await _reset(session)
    res = await create_subscription(session, "https://broken.example/feed")
    await session.commit()
    fetcher = _FailingFetcher()

    for _ in range(MAX_CONSECUTIVE_FAILURES):
        await poll_subscriptions(session, fetcher, _SINCE)

    sub = await session.get(FeedSubscription, res.subscription.id)
    assert sub is not None
    assert sub.consecutive_failures >= MAX_CONSECUTIVE_FAILURES
    assert sub.active is False
    assert sub.deactivated_reason is not None and "consecutive failures" in sub.deactivated_reason
