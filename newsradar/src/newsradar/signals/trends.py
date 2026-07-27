"""Trend detection — a *term/entity* surging in share, distinct from an event.

An event is a cluster of documents about one happening. A **trend** is a term or
entity (from ``document_enrichment.topics`` / ``entities``) whose share of the
watchlist's documents in the current window is at least
:data:`~newsradar.signals.weights.TREND_MIN_LIFT`× its share over the preceding
week — with volume (``>= TREND_MIN_DOCS``) and source-diversity
(``>= TREND_MIN_SOURCES``) floors so a single chatty source cannot manufacture a
trend.

The share counting is done in SQL (``unnest``/``jsonb_array_elements`` over the
pre-extracted term arrays); Python only does the divisions and threshold checks.
Detected trends upsert into ``trends`` keyed by ``(watchlist_id, term, term_kind)``
with ``first_detected_at`` preserved, so the ``new_trend`` alert fires once.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Trend
from newsradar.logging import get_logger
from newsradar.signals import weights as w

log = get_logger(__name__)

DEFAULT_WINDOW_HOURS = 24
BASELINE_DAYS = 7


@dataclass(frozen=True)
class TermStat:
    """Per-term counts within one window."""

    term: str
    term_kind: str
    doc_count: int
    source_count: int
    event_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass(frozen=True)
class TrendCandidate:
    """A term that cleared the trend thresholds (not yet persisted)."""

    term: str
    term_kind: str
    current_share: float
    baseline_share: float
    lift: float
    doc_count: int
    source_count: int
    representative_event_ids: list[uuid.UUID]


@dataclass(frozen=True)
class TrendResult(TrendCandidate):
    """A persisted trend, with whether this run first created it."""

    is_new: bool = False
    first_detected_at: dt.datetime | None = None


def compute_trends(
    current: Sequence[TermStat],
    current_total: int,
    baseline: dict[tuple[str, str], int],
    baseline_total: int,
) -> list[TrendCandidate]:
    """Pure trend detection from windowed term counts.

    ``baseline`` maps ``(term, term_kind)`` to its document count over the prior
    week. A term absent from the baseline uses Laplace-smoothed ``0.5``-count share
    so a genuinely new surging term yields a large but finite lift rather than a
    divide-by-zero.
    """

    if current_total <= 0:
        return []
    out: list[TrendCandidate] = []
    for stat in current:
        if stat.doc_count < w.TREND_MIN_DOCS or stat.source_count < w.TREND_MIN_SOURCES:
            continue
        current_share = stat.doc_count / current_total
        base_count = baseline.get((stat.term, stat.term_kind), 0)
        if baseline_total > 0 and base_count > 0:
            baseline_share = base_count / baseline_total
        else:
            # Laplace smoothing for a never-before-seen term.
            baseline_share = 0.5 / (baseline_total + 1)
        lift = current_share / baseline_share if baseline_share > 0 else 0.0
        if lift < w.TREND_MIN_LIFT:
            continue
        out.append(
            TrendCandidate(
                term=stat.term,
                term_kind=stat.term_kind,
                current_share=round(current_share, 6),
                baseline_share=round(baseline_share, 6),
                lift=round(lift, 3),
                doc_count=stat.doc_count,
                source_count=stat.source_count,
                representative_event_ids=stat.event_ids,
            )
        )
    out.sort(key=lambda c: c.lift, reverse=True)
    return out


_TERM_COUNTS_SQL = text(
    """
    WITH docs AS (
        SELECT d.id, d.source_id, ed.event_id, de.topics, de.entities
        FROM documents d
        JOIN document_matches m ON m.document_id = d.id AND m.watchlist_id = :watchlist_id
        JOIN document_enrichment de ON de.document_id = d.id
        LEFT JOIN event_documents ed ON ed.document_id = d.id
        WHERE d.dedup_of IS NULL
          AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
          AND coalesce(d.published_at, d.fetched_at) <  CAST(:end_at AS timestamptz)
    ),
    topic_terms AS (
        SELECT id, source_id, event_id, lower(trim(t)) AS term, 'topic' AS kind
        FROM docs, unnest(coalesce(topics, ARRAY[]::text[])) AS t
    ),
    entity_terms AS (
        SELECT id, source_id, event_id, lower(trim(e ->> 'text')) AS term, 'entity' AS kind
        FROM docs
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(entities) = 'array' THEN entities ELSE '[]'::jsonb END
        ) AS e
        WHERE e ->> 'text' IS NOT NULL
    ),
    all_terms AS (
        SELECT * FROM topic_terms
        UNION ALL
        SELECT * FROM entity_terms
    )
    SELECT
        term,
        kind,
        count(DISTINCT id) AS doc_count,
        count(DISTINCT source_id) AS source_count,
        array_agg(DISTINCT event_id) FILTER (WHERE event_id IS NOT NULL) AS event_ids
    FROM all_terms
    WHERE term <> ''
    GROUP BY term, kind
    """
)

_WINDOW_TOTAL_SQL = text(
    """
    SELECT count(*) AS c
    FROM documents d
    JOIN document_matches m ON m.document_id = d.id AND m.watchlist_id = :watchlist_id
    JOIN document_enrichment de ON de.document_id = d.id
    WHERE d.dedup_of IS NULL
      AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
      AND coalesce(d.published_at, d.fetched_at) <  CAST(:end_at AS timestamptz)
    """
)


async def _term_stats(
    session: AsyncSession, watchlist_id: uuid.UUID, start_at: dt.datetime, end_at: dt.datetime
) -> tuple[list[TermStat], int]:
    params = {"watchlist_id": watchlist_id, "start_at": start_at, "end_at": end_at}
    rows = (await session.execute(_TERM_COUNTS_SQL, params)).all()
    stats = [
        TermStat(
            term=r.term,
            term_kind=r.kind,
            doc_count=int(r.doc_count),
            source_count=int(r.source_count),
            event_ids=list(r.event_ids or []),
        )
        for r in rows
    ]
    total = int((await session.execute(_WINDOW_TOTAL_SQL, params)).scalar_one())
    return stats, total


async def detect_trends(
    session: AsyncSession,
    watchlist_id: uuid.UUID,
    *,
    now: dt.datetime,
    window_hours: int = DEFAULT_WINDOW_HOURS,
) -> list[TrendCandidate]:
    """Detect (but do not persist) trends for a watchlist as of ``now``."""

    current_start = now - dt.timedelta(hours=window_hours)
    baseline_start = now - dt.timedelta(days=BASELINE_DAYS)
    current, current_total = await _term_stats(session, watchlist_id, current_start, now)
    baseline_stats, baseline_total = await _term_stats(
        session, watchlist_id, baseline_start, current_start
    )
    baseline = {(s.term, s.term_kind): s.doc_count for s in baseline_stats}
    return compute_trends(current, current_total, baseline, baseline_total)


async def update_trends(
    session: AsyncSession,
    watchlist_id: uuid.UUID,
    *,
    now: dt.datetime,
    window_hours: int = DEFAULT_WINDOW_HOURS,
) -> list[TrendResult]:
    """Detect and upsert trends; return results flagged with ``is_new``."""

    candidates = await detect_trends(session, watchlist_id, now=now, window_hours=window_hours)
    if not candidates:
        return []

    existing_keys = {
        (term, kind)
        for term, kind in (
            await session.execute(
                select(Trend.term, Trend.term_kind).where(Trend.watchlist_id == watchlist_id)
            )
        ).all()
    }

    results: list[TrendResult] = []
    for c in candidates:
        is_new = (c.term, c.term_kind) not in existing_keys
        stmt = pg_insert(Trend).values(
            watchlist_id=watchlist_id,
            term=c.term,
            term_kind=c.term_kind,
            current_share=c.current_share,
            baseline_share=c.baseline_share,
            lift=c.lift,
            doc_count=c.doc_count,
            source_count=c.source_count,
            representative_event_ids=c.representative_event_ids or None,
            first_detected_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_trends_wl_term_kind",
            set_={
                "current_share": stmt.excluded.current_share,
                "baseline_share": stmt.excluded.baseline_share,
                "lift": stmt.excluded.lift,
                "doc_count": stmt.excluded.doc_count,
                "source_count": stmt.excluded.source_count,
                "representative_event_ids": stmt.excluded.representative_event_ids,
                "updated_at": now,
            },
        )
        await session.execute(stmt)
        results.append(
            TrendResult(
                term=c.term,
                term_kind=c.term_kind,
                current_share=c.current_share,
                baseline_share=c.baseline_share,
                lift=c.lift,
                doc_count=c.doc_count,
                source_count=c.source_count,
                representative_event_ids=c.representative_event_ids,
                is_new=is_new,
                first_detected_at=now,
            )
        )
    await session.commit()
    log.info("trends.update", watchlist=str(watchlist_id), detected=len(results))
    return results
