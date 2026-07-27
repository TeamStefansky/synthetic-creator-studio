"""ReportContext completeness — every section populated, and zero raw bodies."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import EventMetric, Trend
from newsradar.reports.builder import build_report_context
from tests.signals import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)
SECTIONS = ["overview", "hot_events", "trends", "negative_coverage", "geo"]

SECRET_BODY = "THIS_IS_A_RAW_ARTICLE_BODY_THAT_MUST_NEVER_APPEAR_IN_THE_CONTEXT"


async def _seed(session: AsyncSession) -> tuple:
    await f.reset(session)
    wl = await f.make_watchlist(session, name="Demo Watchlist")
    entity = await f.add_entity(session, wl, "Mayor", entity_type="person", is_primary=True)
    t1 = await f.make_source(session, "tier1.com", tier=1, source_type="news")
    social = await f.make_source(session, "social.com", tier=3, source_type="social")

    ev = await f.make_event(
        session,
        wl,
        title="Mayor scandal widens",
        first_seen_at=NOW - dt.timedelta(hours=3),
        last_seen_at=NOW - dt.timedelta(minutes=30),
    )
    ev.heat_score = 88.0
    ev.doc_count = 6
    ev.source_count = 5
    ev.country_codes = ["IL"]

    # Negative coverage with evidence spans; bodies present in the DB but must be
    # excluded from the context.
    for i in range(6):
        src = t1 if i % 2 == 0 else social
        d = await f.make_document(
            session,
            src,
            title=f"Report {i} on the mayor",
            body=SECRET_BODY,
            published_at=NOW - dt.timedelta(hours=1, minutes=i),
        )
        await f.add_match(session, d, wl, ["mayor"])
        await f.link_doc(session, ev, d)
        await f.add_enrichment(
            session,
            d,
            prominence=1.0,
            is_opinion=False,
            geo={"lat": 32.0853, "lon": 34.7818, "country_code": "IL"},
        )
        await f.add_stance(
            session,
            d,
            entity,
            stance=-2,
            confidence=0.9,
            evidence_span="the mayor concealed the report",
        )

    # Two metric buckets so trajectory can be computed.
    session.add(
        EventMetric(
            event_id=ev.id,
            bucket_at=NOW - dt.timedelta(hours=1),
            heat_score=70.0,
            velocity=2.0,
            acceleration=1.0,
            source_diversity=0.8,
            negativity_index=0.9,
        )
    )
    session.add(
        EventMetric(
            event_id=ev.id,
            bucket_at=NOW,
            heat_score=88.0,
            velocity=6.0,
            acceleration=4.0,
            source_diversity=0.9,
            negativity_index=1.0,
        )
    )

    session.add(
        Trend(
            watchlist_id=wl.id,
            term="corruption",
            term_kind="topic",
            current_share=0.3,
            baseline_share=0.05,
            lift=6.0,
            doc_count=10,
            source_count=5,
            representative_event_ids=[ev.id],
            first_detected_at=NOW,
        )
    )
    await session.commit()
    return wl, ev, entity


@pytest.mark.asyncio
async def test_context_is_complete(session: AsyncSession) -> None:
    wl, ev, entity = await _seed(session)
    ctx = await build_report_context(
        session, watchlist_id=wl.id, lookback_hours=24, sections=SECTIONS, now=NOW
    )

    assert ctx.watchlist_name == "Demo Watchlist"
    assert ctx.period_end == NOW
    assert ctx.lookback_hours == 24

    # Hot events with trajectory.
    assert len(ctx.top_events) == 1
    top = ctx.top_events[0]
    assert top.event_id == ev.id
    assert top.heat_score == 88.0
    assert top.prev_heat_score == 70.0
    assert top.trajectory == "rising"

    # New events (first seen within window).
    assert any(e.event_id == ev.id for e in ctx.new_events)

    # Trends, negative coverage, geo, source breakdown, volume, noise all present.
    assert ctx.trends and ctx.trends[0].term == "corruption"
    assert ctx.negative_coverage
    entity_cov = ctx.negative_coverage[0]
    assert entity_cov.entity_id == entity.id
    assert entity_cov.negative_doc_count == 6
    assert entity_cov.negativity_index >= 0.6
    assert entity_cov.evidence and entity_cov.evidence[0].evidence_span
    assert ctx.geo_hot_zones and ctx.geo_hot_zones[0].country_code == "IL"
    assert ctx.country_breakdown
    assert ctx.source_breakdown
    assert ctx.noise.documents_ingested >= 6
    assert ctx.volume.current_docs == 6


@pytest.mark.asyncio
async def test_context_contains_no_raw_bodies(session: AsyncSession) -> None:
    wl, _ev, _entity = await _seed(session)
    ctx = await build_report_context(
        session, watchlist_id=wl.id, lookback_hours=24, sections=SECTIONS, now=NOW
    )
    dumped = ctx.model_dump_json()
    assert SECRET_BODY not in dumped


@pytest.mark.asyncio
async def test_empty_watchlist_yields_empty_but_valid_context(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session, name="Quiet")
    await session.commit()
    ctx = await build_report_context(
        session, watchlist_id=wl.id, lookback_hours=24, sections=SECTIONS, now=NOW
    )
    assert ctx.top_events == []
    assert ctx.negative_coverage == []
    assert ctx.volume.current_docs == 0
    assert ctx.noise.documents_ingested == 0
