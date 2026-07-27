"""Seasonal baseline: mean documents per hour-of-week over the trailing weeks."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals.baseline import build_seasonal_baseline, hour_of_week
from tests.signals import _factories as f

TZ = "Asia/Jerusalem"


def test_hour_of_week_slot() -> None:
    # 2026-06-07 is a Sunday; 09:00 local -> slot 0*24 + 9 = 9.
    sunday_9 = dt.datetime(2026, 6, 7, 6, 0, tzinfo=dt.UTC)  # 09:00 Asia/Jerusalem (UTC+3)
    assert hour_of_week(sunday_9, TZ) == 9


@pytest.mark.asyncio
async def test_baseline_is_mean_over_weeks(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "a.com")
    wl = await f.make_watchlist(session)

    # A fixed local slot (Sunday 09:00 Jerusalem == 06:00 UTC) gets documents in
    # each of 4 trailing weeks: 2, 4, 4, 2 -> mean 3.0 per occurrence.
    slot_utc = dt.datetime(2026, 6, 7, 6, 0, tzinfo=dt.UTC)
    # ``now`` sits just after the most-recent occurrence so all 4 trailing weeks
    # (slot_utc, -7d, -14d, -21d) fall inside the [now - 4w, now) window.
    now = slot_utc + dt.timedelta(days=1)
    per_week = [2, 4, 4, 2]
    for week_back, n in enumerate(per_week, start=0):
        ts = slot_utc - dt.timedelta(weeks=week_back)
        for _ in range(n):
            d = await f.make_document(session, src, published_at=ts)
            await f.add_match(session, d, wl, ["x"])
    await session.commit()

    baseline = await build_seasonal_baseline(session, wl.id, now=now, tz=TZ, weeks=4)
    slot = hour_of_week(slot_utc, TZ)
    assert baseline.means[slot] == sum(per_week) / 4  # 3.0
    assert baseline.expected_for(slot_utc) == 3.0
    # An unseen slot expects zero.
    assert baseline.expected_for(slot_utc + dt.timedelta(hours=1)) == 0.0
