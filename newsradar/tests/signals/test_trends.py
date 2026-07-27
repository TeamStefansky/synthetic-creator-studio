"""Trend detection: share surge with volume + source-diversity floors."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Trend
from newsradar.signals import weights as w
from newsradar.signals.trends import TermStat, compute_trends, update_trends
from tests.signals import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


def _stat(term: str, docs: int, sources: int) -> TermStat:
    return TermStat(term=term, term_kind="topic", doc_count=docs, source_count=sources)


def test_volume_and_source_floors_enforced() -> None:
    # Below the doc floor.
    assert compute_trends([_stat("a", 4, 4)], 100, {}, 700) == []
    # Enough docs but too few sources (chatty single source).
    assert compute_trends([_stat("b", 20, 2)], 100, {}, 700) == []


def test_surge_detected_with_finite_lift_for_new_term() -> None:
    # New term: 10 docs / 100 current, absent from a 700-doc baseline.
    out = compute_trends([_stat("newthing", 10, 5)], 100, {}, 700)
    assert len(out) == 1
    c = out[0]
    assert c.doc_count == 10 and c.source_count == 5
    assert c.current_share == pytest.approx(0.1)
    assert c.lift >= w.TREND_MIN_LIFT
    assert c.lift < 1e6  # finite (Laplace smoothed)


def test_stable_term_not_a_trend() -> None:
    # 10/100 = 0.1 now, 70/700 = 0.1 baseline -> lift ~1.0, not a trend.
    out = compute_trends([_stat("routine", 10, 5)], 100, {("routine", "topic"): 70}, 700)
    assert out == []


def test_doubled_share_is_a_trend() -> None:
    # 0.2 now vs 0.1 baseline -> lift 2.0 (== threshold).
    out = compute_trends([_stat("rising", 20, 6)], 100, {("rising", "topic"): 70}, 700)
    assert len(out) == 1
    assert out[0].lift == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_update_trends_persists_and_flags_new(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)

    # Current window: 10 docs from 5 sources all tagged "crisis".
    for i in range(10):
        src = await f.make_source(session, f"s{i % 5}-{i}.com")
        d = await f.make_document(session, src, published_at=NOW - dt.timedelta(hours=2))
        await f.add_match(session, d, wl, ["x"])
        await f.link_doc(session, ev, d)
        await f.add_enrichment(session, d, topics=["crisis"])
    # Baseline week: plenty of unrelated docs, "crisis" absent.
    for i in range(60):
        src = await f.make_source(session, f"b{i}.com")
        d = await f.make_document(session, src, published_at=NOW - dt.timedelta(days=3))
        await f.add_match(session, d, wl, ["x"])
        await f.add_enrichment(session, d, topics=["weather"])
    await session.commit()

    results = await update_trends(session, wl.id, now=NOW)
    crisis = [r for r in results if r.term == "crisis"]
    assert len(crisis) == 1
    assert crisis[0].is_new is True
    assert crisis[0].lift >= w.TREND_MIN_LIFT
    assert ev.id in crisis[0].representative_event_ids

    persisted = (
        (await session.execute(select(Trend).where(Trend.watchlist_id == wl.id))).scalars().all()
    )
    assert any(t.term == "crisis" for t in persisted)

    # A second run updates in place and no longer flags it as new.
    results2 = await update_trends(session, wl.id, now=NOW)
    crisis2 = [r for r in results2 if r.term == "crisis"]
    assert crisis2 and crisis2[0].is_new is False
    still = (
        (
            await session.execute(
                select(Trend).where(Trend.watchlist_id == wl.id, Trend.term == "crisis")
            )
        )
        .scalars()
        .all()
    )
    assert len(still) == 1  # upsert, not duplicate
