from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas import StrategyRequest
from app.strategy.service import StrategyService

router = APIRouter(prefix="/strategy", tags=["strategy"])


@router.post("", status_code=201)
def build(payload: StrategyRequest, session: Session = Depends(get_session)):
    strategy = StrategyService(session).build_strategy(
        persona_id=payload.persona_id,
        title=payload.title,
        region=payload.region,
        language=payload.language,
        interests=payload.interests,
        trends=payload.trends,
    )
    return {
        "id": str(strategy.id),
        "title": strategy.title,
        "audience": strategy.audience,
        "content_pillars": strategy.content_pillars,
        "tone": strategy.tone,
        "recommended_platforms": strategy.recommended_platforms,
        "themes": strategy.themes,
    }
