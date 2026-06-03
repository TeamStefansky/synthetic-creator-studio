from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.analytics.service import AnalyticsService
from app.db import get_session

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/personas/{persona_id}/summary")
def summary(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    return AnalyticsService(session).summary(persona_id=persona_id)


@router.get("/personas/{persona_id}/compliance")
def compliance(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    # Compliance view (M7): confirm every published asset carried disclosure.
    return AnalyticsService(session).compliance_view(persona_id=persona_id)
