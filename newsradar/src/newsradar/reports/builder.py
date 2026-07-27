"""Assemble a :class:`ReportContext` for a watchlist and window — no LLM involved.

This is the entire factual substance of a report, computed from the database:
ranked hot events with trajectory, new events since the last report, trends,
negative coverage grouped by entity (with evidence spans and links), geo hot
zones, source breakdown, volume vs. the previous period, and ingestion-noise
stats. It deliberately contains **zero raw article bodies** — only ids, titles,
short evidence spans, links and metrics — so a downstream model has facts to
render but no text to hallucinate from.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Event, Trend, Watchlist
from newsradar.reports.context import (
    CountryCount,
    EntityNegativeCoverage,
    EventBrief,
    EvidenceItem,
    HotZoneBrief,
    NoiseStats,
    ReportContext,
    SourceBreakdownItem,
    TrendBrief,
    VolumeStats,
)
from newsradar.signals import geo
from newsradar.signals.negativity import NegRow, compute_negativity

TOP_EVENTS_DEFAULT = 10
MAX_EVIDENCE_PER_ENTITY = 5


@dataclass(frozen=True)
class _MetricRow:
    heat_score: float | None
    velocity: float | None
    acceleration: float | None
    source_diversity: float | None
    negativity_index: float | None


def _trajectory(current: float, prev: float | None) -> str:
    if prev is None or abs(current - prev) < 1e-9:
        return "steady"
    return "rising" if current > prev else "falling"


async def _latest_two_metrics(session: AsyncSession, event_id: uuid.UUID) -> list[_MetricRow]:
    rows = (
        await session.execute(
            text(
                """
                SELECT heat_score, velocity, acceleration, source_diversity, negativity_index
                FROM event_metrics
                WHERE event_id = :event_id
                ORDER BY bucket_at DESC
                LIMIT 2
                """
            ),
            {"event_id": event_id},
        )
    ).all()
    return [
        _MetricRow(
            heat_score=r.heat_score,
            velocity=r.velocity,
            acceleration=r.acceleration,
            source_diversity=r.source_diversity,
            negativity_index=r.negativity_index,
        )
        for r in rows
    ]


async def _event_brief(session: AsyncSession, event: Event) -> EventBrief:
    metrics = await _latest_two_metrics(session, event.id)
    latest = metrics[0] if metrics else None
    prev_heat = metrics[1].heat_score if len(metrics) > 1 else None
    current_heat = (
        latest.heat_score if latest and latest.heat_score is not None else event.heat_score
    )
    return EventBrief(
        event_id=event.id,
        title=event.title,
        status=str(event.status),
        heat_score=round(current_heat, 2),
        prev_heat_score=round(prev_heat, 2) if prev_heat is not None else None,
        trajectory=_trajectory(current_heat, prev_heat),
        doc_count=event.doc_count,
        source_count=event.source_count,
        velocity=latest.velocity if latest else None,
        acceleration=latest.acceleration if latest else None,
        source_diversity=latest.source_diversity if latest else None,
        negativity_index=latest.negativity_index if latest else None,
        country_codes=list(event.country_codes or []),
        first_seen_at=event.first_seen_at,
        last_seen_at=event.last_seen_at,
    )


async def _top_events(
    session: AsyncSession, watchlist_id: uuid.UUID, period_start: dt.datetime, limit: int
) -> list[EventBrief]:
    events = list(
        (
            await session.execute(
                select(Event)
                .where(
                    Event.watchlist_id == watchlist_id,
                    Event.last_seen_at >= period_start,
                )
                .order_by(Event.heat_score.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [await _event_brief(session, e) for e in events]


async def _new_events(
    session: AsyncSession, watchlist_id: uuid.UUID, since: dt.datetime, limit: int
) -> list[EventBrief]:
    events = list(
        (
            await session.execute(
                select(Event)
                .where(
                    Event.watchlist_id == watchlist_id,
                    Event.first_seen_at >= since,
                )
                .order_by(Event.first_seen_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [await _event_brief(session, e) for e in events]


async def _trends(session: AsyncSession, watchlist_id: uuid.UUID) -> list[TrendBrief]:
    rows = list(
        (
            await session.execute(
                select(Trend).where(Trend.watchlist_id == watchlist_id).order_by(Trend.lift.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        TrendBrief(
            term=t.term,
            term_kind=t.term_kind,
            lift=t.lift,
            current_share=t.current_share,
            baseline_share=t.baseline_share,
            doc_count=t.doc_count,
            source_count=t.source_count,
            representative_event_ids=list(t.representative_event_ids or []),
            first_detected_at=t.first_detected_at,
        )
        for t in rows
    ]


_NEG_COVERAGE_SQL = text(
    """
    SELECT
        we.id AS entity_id, we.name AS entity_name, we.is_primary AS is_primary,
        st.stance AS stance, st.confidence AS confidence,
        st.evidence_span AS evidence_span, st.framing AS framing,
        de.prominence AS prominence, coalesce(de.is_opinion, false) AS is_opinion,
        s.tier AS tier, s.name AS source_name,
        d.id AS document_id, d.url AS url, d.title AS title,
        coalesce(d.published_at, d.fetched_at) AS published_at
    FROM stance_assessments st
    JOIN watchlist_entities we ON we.id = st.entity_id AND we.watchlist_id = :watchlist_id
    JOIN documents d ON d.id = st.document_id AND d.dedup_of IS NULL
    JOIN sources s ON s.id = d.source_id
    LEFT JOIN document_enrichment de ON de.document_id = d.id
    WHERE coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
      AND coalesce(d.published_at, d.fetched_at) <= CAST(:end_at AS timestamptz)
    """
)


async def _negative_coverage(
    session: AsyncSession, watchlist_id: uuid.UUID, start_at: dt.datetime, end_at: dt.datetime
) -> list[EntityNegativeCoverage]:
    rows = (
        await session.execute(
            _NEG_COVERAGE_SQL,
            {"watchlist_id": watchlist_id, "start_at": start_at, "end_at": end_at},
        )
    ).all()

    neg_rows = [
        NegRow(
            entity_id=r.entity_id,
            entity_name=r.entity_name,
            is_primary=bool(r.is_primary),
            stance=int(r.stance),
            confidence=r.confidence,
            prominence=r.prominence,
            is_opinion=bool(r.is_opinion),
            tier=r.tier,
        )
        for r in rows
    ]
    negativity = compute_negativity(neg_rows)

    # Evidence: negative, non-opinion rows per entity, strongest first.
    evidence_by_entity: dict[uuid.UUID, list[EvidenceItem]] = {}
    for r in rows:
        if int(r.stance) >= 0 or bool(r.is_opinion):
            continue
        evidence_by_entity.setdefault(r.entity_id, []).append(
            EvidenceItem(
                document_id=r.document_id,
                source_name=r.source_name,
                tier=r.tier,
                url=r.url,
                title=r.title,
                published_at=r.published_at,
                stance=int(r.stance),
                confidence=r.confidence,
                evidence_span=r.evidence_span,
                framing=r.framing,
                is_opinion=bool(r.is_opinion),
            )
        )

    out: list[EntityNegativeCoverage] = []
    for ent in negativity.by_entity:
        if ent.main.negative_doc_count == 0 and ent.opinion.negative_doc_count == 0:
            continue
        evidence = evidence_by_entity.get(ent.entity_id, [])
        # Most hostile first (stance ascending: -2 before -1), then most confident.
        evidence.sort(key=lambda e: (e.stance, -(e.confidence or 0.0)))
        out.append(
            EntityNegativeCoverage(
                entity_id=ent.entity_id,
                entity_name=ent.entity_name,
                is_primary=ent.is_primary,
                negativity_index=round(ent.main.negativity_index, 3),
                negative_doc_count=ent.main.negative_doc_count,
                negative_reach_share=round(ent.main.negative_reach_share, 3),
                opinion_negative_doc_count=ent.opinion.negative_doc_count,
                evidence=evidence[:MAX_EVIDENCE_PER_ENTITY],
            )
        )
    # Primary entities first, then by intensity.
    out.sort(key=lambda e: (e.is_primary, e.negativity_index), reverse=True)
    return out


async def _source_breakdown(
    session: AsyncSession, watchlist_id: uuid.UUID, start_at: dt.datetime, end_at: dt.datetime
) -> list[SourceBreakdownItem]:
    rows = (
        await session.execute(
            text(
                """
                SELECT s.name AS name, s.tier AS tier, count(*) AS c
                FROM documents d
                JOIN document_matches m ON m.document_id = d.id AND m.watchlist_id = :watchlist_id
                JOIN sources s ON s.id = d.source_id
                WHERE d.dedup_of IS NULL
                  AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
                  AND coalesce(d.published_at, d.fetched_at) <= CAST(:end_at AS timestamptz)
                GROUP BY s.id, s.name, s.tier
                ORDER BY c DESC
                LIMIT 25
                """
            ),
            {"watchlist_id": watchlist_id, "start_at": start_at, "end_at": end_at},
        )
    ).all()
    return [SourceBreakdownItem(source_name=r.name, tier=r.tier, doc_count=int(r.c)) for r in rows]


async def _volume_and_noise(
    session: AsyncSession,
    watchlist_id: uuid.UUID,
    period_start: dt.datetime,
    period_end: dt.datetime,
) -> tuple[VolumeStats, NoiseStats]:
    lookback = period_end - period_start
    prev_start = period_start - lookback
    row = (
        await session.execute(
            text(
                """
                WITH scoped AS (
                    SELECT d.dedup_of AS dedup_of,
                           coalesce(d.published_at, d.fetched_at) AS ts
                    FROM documents d
                    JOIN document_matches m
                        ON m.document_id = d.id AND m.watchlist_id = :watchlist_id
                ),
                cur AS (
                    SELECT * FROM scoped
                    WHERE ts >= CAST(:start_at AS timestamptz)
                      AND ts <= CAST(:end_at AS timestamptz)
                )
                SELECT
                    (SELECT count(*) FROM cur WHERE dedup_of IS NULL) AS current_unique,
                    (SELECT count(*) FROM scoped
                        WHERE dedup_of IS NULL
                          AND ts >= CAST(:prev_start AS timestamptz)
                          AND ts <  CAST(:start_at AS timestamptz)) AS prev_unique,
                    (SELECT count(*) FROM cur) AS ingested,
                    (SELECT count(*) FROM cur WHERE dedup_of IS NOT NULL) AS duplicates
                """
            ),
            {
                "watchlist_id": watchlist_id,
                "start_at": period_start,
                "end_at": period_end,
                "prev_start": prev_start,
            },
        )
    ).one()

    current = int(row.current_unique)
    prev = int(row.prev_unique)
    change_pct = round((current - prev) / prev * 100.0, 1) if prev > 0 else None
    volume = VolumeStats(current_docs=current, previous_docs=prev, change_pct=change_pct)
    noise = NoiseStats(
        documents_ingested=int(row.ingested),
        duplicates_collapsed=int(row.duplicates),
        unique_documents=current,
    )
    return volume, noise


async def _geo(
    session: AsyncSession, watchlist_id: uuid.UUID, now: dt.datetime
) -> tuple[list[HotZoneBrief], list[CountryCount]]:
    zones = await geo.hot_zones(session, watchlist_id, now=now)
    counts = await geo.geo_country_counts(session, watchlist_id, now=now)
    zone_briefs = [
        HotZoneBrief(
            h3=z.h3,
            country_code=z.country_code,
            lat=z.lat,
            lon=z.lon,
            doc_count=z.doc_count,
            z=z.z,
            top_event_ids=z.top_event_ids,
        )
        for z in zones
    ]
    country_briefs = [
        CountryCount(country_code=cc, doc_count=c)
        for cc, c in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return zone_briefs, country_briefs


async def build_report_context(
    session: AsyncSession,
    *,
    watchlist_id: uuid.UUID,
    lookback_hours: int,
    sections: list[str],
    now: dt.datetime | None = None,
    new_since: dt.datetime | None = None,
    top_n: int = TOP_EVENTS_DEFAULT,
) -> ReportContext:
    """Build the complete, LLM-free report context for a watchlist and window."""

    now = now or dt.datetime.now(dt.UTC)
    period_start = now - dt.timedelta(hours=lookback_hours)
    new_since = new_since or period_start

    watchlist = (
        await session.execute(select(Watchlist).where(Watchlist.id == watchlist_id))
    ).scalar_one()

    top_events = await _top_events(session, watchlist_id, period_start, top_n)
    new_events = await _new_events(session, watchlist_id, new_since, top_n)
    trends = await _trends(session, watchlist_id)
    negative_coverage = await _negative_coverage(session, watchlist_id, period_start, now)
    zone_briefs, country_briefs = await _geo(session, watchlist_id, now)
    source_breakdown = await _source_breakdown(session, watchlist_id, period_start, now)
    volume, noise = await _volume_and_noise(session, watchlist_id, period_start, now)

    return ReportContext(
        watchlist_id=watchlist_id,
        watchlist_name=watchlist.name,
        generated_at=now,
        period_start=period_start,
        period_end=now,
        lookback_hours=lookback_hours,
        sections=sections,
        top_events=top_events,
        new_events=new_events,
        trends=trends,
        negative_coverage=negative_coverage,
        geo_hot_zones=zone_briefs,
        country_breakdown=country_briefs,
        source_breakdown=source_breakdown,
        volume=volume,
        noise=noise,
    )
