"""DB-backed velocity series: dense hourly buckets with empty hours as real zeros."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals.velocity import event_hourly_series, latest_bucket
from tests.signals import _factories as f

START = dt.datetime(2026, 6, 1, 0, 0, tzinfo=dt.UTC)


@pytest.mark.asyncio
async def test_hourly_series_is_dense_with_zero_hours(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "a.com")
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl, first_seen_at=START)

    # Hour 0: 2 docs, hour 1: 0 docs (gap), hour 2: 3 docs.
    for _ in range(2):
        d = await f.make_document(session, src, published_at=START)
        await f.link_doc(session, ev, d)
    for _ in range(3):
        d = await f.make_document(session, src, published_at=START + dt.timedelta(hours=2))
        await f.link_doc(session, ev, d)
    await session.commit()

    now = START + dt.timedelta(hours=2, minutes=30)
    series = await event_hourly_series(session, ev.id, now=now)

    assert [b.doc_count for b in series] == [2, 0, 3]
    assert [b.velocity for b in series] == [2.0, 0.0, 3.0]
    # Too few trailing buckets -> acceleration is None everywhere here.
    assert all(b.acceleration is None for b in series)
    last = latest_bucket(series)
    assert last is not None and last.doc_count == 3


@pytest.mark.asyncio
async def test_acceleration_emitted_after_warmup(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "a.com")
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl, first_seen_at=START)

    # 8 quiet hours (1 doc each), then a burst of 12 in the 9th hour.
    for h in range(8):
        d = await f.make_document(session, src, published_at=START + dt.timedelta(hours=h))
        await f.link_doc(session, ev, d)
    for _ in range(12):
        d = await f.make_document(session, src, published_at=START + dt.timedelta(hours=8))
        await f.link_doc(session, ev, d)
    await session.commit()

    now = START + dt.timedelta(hours=8, minutes=30)
    series = await event_hourly_series(session, ev.id, now=now)

    assert [b.doc_count for b in series] == [1, 1, 1, 1, 1, 1, 1, 1, 12]
    burst = series[-1]
    assert burst.acceleration is not None and burst.acceleration >= 3.0
