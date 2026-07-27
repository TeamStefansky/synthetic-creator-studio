"""DB factories for signal-engine tests: events, links, enrichment, stance.

Builds on the P2 pipeline factories (sources/documents/watchlists) and adds the
event-side helpers the signal tests need.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    Document,
    DocumentEnrichment,
    Event,
    EventDocument,
    Source,
    StanceAssessment,
    Watchlist,
    WatchlistEntity,
)
from tests.pipeline._factories import (  # re-exported for convenience
    T0,
    add_entity,
    add_match,
    make_document,
    make_source,
    make_watchlist,
)

__all__ = [
    "T0",
    "add_entity",
    "add_enrichment",
    "add_match",
    "add_stance",
    "link_doc",
    "make_document",
    "make_event",
    "make_source",
    "make_watchlist",
    "reset",
]


async def reset(session: AsyncSession) -> None:
    """Truncate every table the signal tests touch."""

    await session.execute(
        text(
            "TRUNCATE trends, reports, report_schedules, alerts, events, event_documents, "
            "event_metrics, stance_assessments, document_enrichment, document_matches, "
            "documents, watchlist_entities, watchlist_terms, watchlists, sources, "
            "llm_calls CASCADE"
        )
    )
    await session.commit()


async def make_event(
    session: AsyncSession,
    watchlist: Watchlist,
    *,
    title: str | None = None,
    status: str = "active",
    first_seen_at: dt.datetime | None = None,
    last_seen_at: dt.datetime | None = None,
) -> Event:
    ev = Event(
        watchlist_id=watchlist.id,
        title=title,
        status=status,
        first_seen_at=first_seen_at or T0,
        last_seen_at=last_seen_at or T0,
    )
    session.add(ev)
    await session.flush()
    return ev


async def link_doc(
    session: AsyncSession,
    event: Event,
    document: Document,
    *,
    added_at: dt.datetime | None = None,
    similarity: float = 0.9,
) -> EventDocument:
    link = EventDocument(
        event_id=event.id,
        document_id=document.id,
        similarity=similarity,
        added_at=added_at or document.published_at,
    )
    session.add(link)
    await session.flush()
    return link


async def add_enrichment(
    session: AsyncSession,
    document: Document,
    *,
    sentiment_overall: float | None = None,
    prominence: float | None = None,
    is_opinion: bool | None = False,
    geo: dict[str, Any] | None = None,
    entities: list[dict[str, Any]] | None = None,
    topics: list[str] | None = None,
) -> DocumentEnrichment:
    enr = DocumentEnrichment(
        document_id=document.id,
        sentiment_overall=sentiment_overall,
        prominence=prominence,
        is_opinion=is_opinion,
        geo=geo,
        entities=entities,
        topics=topics,
        enriched_at=T0,
    )
    session.add(enr)
    await session.flush()
    return enr


async def add_stance(
    session: AsyncSession,
    document: Document,
    entity: WatchlistEntity,
    *,
    stance: int,
    confidence: float = 0.9,
    evidence_span: str | None = None,
    framing: str | None = None,
) -> StanceAssessment:
    st = StanceAssessment(
        document_id=document.id,
        entity_id=entity.id,
        stance=stance,
        confidence=confidence,
        evidence_span=evidence_span,
        framing=framing,
        model="test",
    )
    session.add(st)
    await session.flush()
    return st


async def make_tiered_source(
    session: AsyncSession, domain: str, *, tier: int, source_type: str = "news"
) -> Source:
    return await make_source(session, domain, tier=tier, source_type=source_type)
