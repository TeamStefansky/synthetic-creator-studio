"""Event detail endpoint: an event with its documents and entity-targeted stance."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import get_session
from newsradar.api.schemas import DocumentOut, EventDetailOut, EventOut, StanceOut
from newsradar.db.models import (
    Document,
    DocumentEnrichment,
    Event,
    EventDocument,
    Source,
    StanceAssessment,
    WatchlistEntity,
)

router = APIRouter(tags=["events"])


@router.get("/events/{event_id}", response_model=EventDetailOut)
async def get_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> EventDetailOut:
    """Return one event with its (non-duplicate) documents and stance assessments."""

    event = (await session.execute(select(Event).where(Event.id == event_id))).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")

    doc_rows = (
        await session.execute(
            select(Document, Source.name, DocumentEnrichment.is_opinion)
            .join(EventDocument, EventDocument.document_id == Document.id)
            .join(Source, Source.id == Document.source_id)
            .join(DocumentEnrichment, DocumentEnrichment.document_id == Document.id, isouter=True)
            .where(EventDocument.event_id == event_id, Document.dedup_of.is_(None))
            .order_by(Document.published_at.desc())
        )
    ).all()
    documents = [
        DocumentOut(
            id=doc.id,
            source_name=source_name,
            url=doc.url,
            title=doc.title,
            published_at=doc.published_at,
            is_opinion=is_opinion,
        )
        for doc, source_name, is_opinion in doc_rows
    ]

    stance_rows = (
        await session.execute(
            select(StanceAssessment, WatchlistEntity.name)
            .join(WatchlistEntity, WatchlistEntity.id == StanceAssessment.entity_id)
            .join(EventDocument, EventDocument.document_id == StanceAssessment.document_id)
            .where(EventDocument.event_id == event_id)
        )
    ).all()
    stance = [
        StanceOut(
            document_id=st.document_id,
            entity_id=st.entity_id,
            entity_name=entity_name,
            stance=st.stance,
            confidence=st.confidence,
            evidence_span=st.evidence_span,
            framing=st.framing,
        )
        for st, entity_name in stance_rows
    ]

    base = EventOut.model_validate(event)
    return EventDetailOut(**base.model_dump(), documents=documents, stance=stance)
