from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.schemas import EntityCreate, EntityOut
from app.services.entities import create_responsible_entity

router = APIRouter(prefix="/entities", tags=["responsible_entity"])


@router.post("", response_model=EntityOut, status_code=201)
def create_entity(payload: EntityCreate, session: Session = Depends(get_session)):
    return create_responsible_entity(
        session,
        name=payload.name,
        contact_email=payload.contact_email,
        kind=payload.kind,
        jurisdiction=payload.jurisdiction,
    )
