from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.analytics.service import AnalyticsService
from app.db import get_session
from app.schemas import AnalyticsIngest

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/events", status_code=201)
def ingest(payload: AnalyticsIngest, session: Session = Depends(get_session)):
    event = AnalyticsService(session).record(
        persona_id=payload.persona_id,
        platform=payload.platform,
        metric=payload.metric,
        value=payload.value,
        post_id=payload.post_id,
        extra=payload.extra,
    )
    return {"id": str(event.id)}


@router.get("/personas/{persona_id}/summary")
def summary(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    return AnalyticsService(session).summary(persona_id=persona_id)


@router.get("/personas/{persona_id}/compliance")
def compliance(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    # Compliance view (M7): confirm every published asset carried disclosure.
    return AnalyticsService(session).compliance_view(persona_id=persona_id)


@router.get("/personas/{persona_id}/dashboard")
def dashboard(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    # One call powering the live dashboard: metrics + compliance + strategy feedback.
    return AnalyticsService(session).dashboard(persona_id=persona_id)
