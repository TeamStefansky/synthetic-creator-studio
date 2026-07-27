"""Event summarization — the ONLY place the frontier (Sonnet) model runs.

For every ``active`` or newly ``emerging`` event with ``source_count >= 3`` we
generate a title (<=90 chars) and a 3-5 sentence summary with Sonnet, using the
8 most representative documents (closest to the centroid, from distinct sources,
tier-1 preferred). A summary is regenerated only when ``doc_count`` has grown by
>= 50% since the last generation, so Sonnet spend stays a small fraction of the
Haiku enrichment spend (cost discipline is a functional requirement).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import (
    Document,
    DocumentEnrichment,
    Event,
    EventDocument,
    EventStatus,
    Source,
)
from newsradar.llm.client import BudgetExceeded, LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import EventSummaryOut
from newsradar.logging import get_logger

log = get_logger(__name__)

MIN_SOURCES_FOR_SUMMARY = 3
REGEN_GROWTH = 1.5  # regenerate when doc_count >= 1.5x the count at last generation
N_REPRESENTATIVES = 8


def _needs_summary(event: Event) -> bool:
    if event.source_count < MIN_SOURCES_FOR_SUMMARY:
        return False
    if event.title is None or event.summary is None or event.summary_doc_count is None:
        return True
    return event.doc_count >= event.summary_doc_count * REGEN_GROWTH


async def _representatives(session: AsyncSession, event: Event) -> list[Document]:
    """8 documents closest to the centroid, from distinct sources, tier-1 preferred."""

    dist = DocumentEnrichment.embedding.cosine_distance(event.centroid).label("dist")
    rows = (
        await session.execute(
            select(Document, Source.tier, dist)
            .join(EventDocument, EventDocument.document_id == Document.id)
            .join(DocumentEnrichment, DocumentEnrichment.document_id == Document.id)
            .join(Source, Source.id == Document.source_id)
            .where(
                EventDocument.event_id == event.id,
                DocumentEnrichment.embedding.is_not(None),
                Document.dedup_of.is_(None),
            )
            .order_by(Source.tier.asc(), dist.asc())
            .limit(60)
        )
    ).all()

    chosen: list[Document] = []
    used_sources: set[uuid.UUID] = set()
    for doc, _tier, _d in rows:
        if doc.source_id in used_sources:
            continue
        used_sources.add(doc.source_id)
        chosen.append(doc)
        if len(chosen) >= N_REPRESENTATIVES:
            break
    return chosen


def _build_prompt(docs: Sequence[Document]) -> str:
    lines = []
    for i, doc in enumerate(docs, 1):
        snippet = (doc.summary or (doc.body or "")[:800] or "").strip()
        lines.append(f"[{i}] {doc.title or '(untitled)'}\n{snippet}")
        lines.append("")
    return "\n".join(lines)


async def summarize_events(
    session: AsyncSession,
    llm: LLMClient,
    *,
    watchlist_id: uuid.UUID,
    force: bool = False,
) -> int:
    """Generate/refresh summaries for a watchlist's eligible events. Returns the count."""

    settings = get_settings()
    system = load_prompt("event_summary.md")

    events = list(
        (
            await session.execute(
                select(Event).where(
                    Event.watchlist_id == watchlist_id,
                    Event.status.in_([EventStatus.active, EventStatus.emerging]),
                    Event.source_count >= MIN_SOURCES_FOR_SUMMARY,
                )
            )
        )
        .scalars()
        .all()
    )

    generated = 0
    for event in events:
        if not force and not _needs_summary(event):
            continue
        reps = await _representatives(session, event)
        if not reps:
            continue
        try:
            out = await llm.generate_structured(
                purpose="event_summary",
                model=settings.sonnet_model,
                system=system,
                user=_build_prompt(reps),
                response_model=EventSummaryOut,
            )
        except BudgetExceeded:
            log.warning("summarize.budget_exceeded", event_id=str(event.id))
            break
        event.title = out.title[:90]
        event.summary = out.summary
        event.summary_model = settings.sonnet_model
        event.summary_doc_count = event.doc_count
        generated += 1

    await session.commit()
    log.info("summarize.events", watchlist=str(watchlist_id), generated=generated)
    return generated
