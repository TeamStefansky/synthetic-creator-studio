"""Batch source onboarding: mixed inputs -> per-line added/duplicate/no_feed/invalid."""

from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import FeedSubscription, SourceImportJob, SourceImportResult
from newsradar.db.session import get_sessionmaker
from newsradar.feeds.batch import process_batch, split_input
from tests.feeds._recorded import recorded


def test_split_input() -> None:
    assert split_input("a.com\nb.com, c.com\n\n , d.com") == [
        "a.com",
        "b.com",
        "c.com",
        "d.com",
    ]


async def _reset(session: AsyncSession) -> None:
    await session.execute(
        text(
            "TRUNCATE source_import_results, source_import_jobs, "
            "feed_subscriptions, documents, sources CASCADE"
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_batch_end_to_end(session: AsyncSession) -> None:
    await _reset(session)
    job = SourceImportJob(status="pending")
    session.add(job)
    await session.commit()
    job_id = job.id

    fetcher = recorded(
        {
            "https://theverge.com/": "theverge_home.html",
            "https://theverge.com/rss/index.xml": "rss_generic.xml",
            "https://techcrunch.com/": "techcrunch_home.html",
            "https://techcrunch.com/feed": "techcrunch_rss.xml",
            "https://acme-widgets.example/": "nofeed_home.html",
        }
    )

    lines = [
        "theverge.com",  # added
        "theverge.com",  # duplicate (same feed)
        "techcrunch.com",  # added (well-known)
        "acme-widgets.example",  # no_feed
        "http://",  # invalid
    ]

    await process_batch(get_sessionmaker(), job_id, lines, fetcher=fetcher, concurrency=4)

    session.expire_all()
    refreshed = await session.get(SourceImportJob, job_id)
    assert refreshed is not None
    assert str(refreshed.status) == "done"
    assert refreshed.total == 5
    assert refreshed.processed == 5

    results = (
        (
            await session.execute(
                select(SourceImportResult)
                .where(SourceImportResult.job_id == job_id)
                .order_by(SourceImportResult.input_line)
            )
        )
        .scalars()
        .all()
    )
    statuses = sorted(str(r.status) for r in results)
    assert statuses == ["added", "added", "duplicate", "invalid", "no_feed"]

    # Two distinct feeds were actually subscribed.
    subs = (await session.execute(select(FeedSubscription))).scalars().all()
    assert {s.feed_url for s in subs} == {
        "https://theverge.com/rss/index.xml",
        "https://techcrunch.com/feed",
    }


@pytest.mark.asyncio
async def test_one_bad_line_never_fails_the_job(session: AsyncSession) -> None:
    await _reset(session)
    job = SourceImportJob(status="pending")
    session.add(job)
    await session.commit()
    job_id = job.id

    # A fetcher that raises for one host but serves another.
    class _PartlyBroken:
        def __init__(self) -> None:
            self.inner = recorded(
                {
                    "https://good.example/": "theverge_home.html",
                    "https://good.example/rss/index.xml": "rss_generic.xml",
                }
            )

        async def get(self, url, headers=None):  # type: ignore[no-untyped-def]
            if "boom.example" in url:
                raise ConnectionError("boom")
            return await self.inner.get(url, headers)

        async def head(self, url, headers=None):  # type: ignore[no-untyped-def]
            return await self.get(url, headers)

        async def get_ranged(self, url, max_bytes=65536, headers=None):  # type: ignore[no-untyped-def]
            return await self.get(url, headers)

        async def robots_allowed(self, url):  # type: ignore[no-untyped-def]
            return True

        async def aclose(self):  # type: ignore[no-untyped-def]
            return None

    await process_batch(
        get_sessionmaker(),
        job_id,
        ["boom.example", "good.example"],
        fetcher=_PartlyBroken(),
        concurrency=2,
    )

    session.expire_all()
    refreshed = await session.get(SourceImportJob, job_id)
    assert refreshed is not None and str(refreshed.status) == "done"
    results = (await session.execute(select(SourceImportResult))).scalars().all()
    by_line = {r.input_line: str(r.status) for r in results}
    assert by_line["good.example"] == "added"
    # The broken line resolves to no_feed (discovery swallows the fetch error).
    assert by_line["boom.example"] in {"no_feed", "error"}
