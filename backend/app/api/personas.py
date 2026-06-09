from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session
from app.models.asset import Asset
from app.models.persona import Persona
from app.schemas import AssetOut, PersonaCreate, PersonaOut
from app.services.personas import create_persona

router = APIRouter(prefix="/personas", tags=["persona"])


@router.get("", response_model=list[PersonaOut])
def list_personas(session: Session = Depends(get_session)):
    return session.query(Persona).order_by(Persona.created_at.desc()).all()


@router.post("", response_model=PersonaOut, status_code=201)
def create(payload: PersonaCreate, session: Session = Depends(get_session)):
    # C3/C4 enforced inside create_persona; ConstraintViolation → 422 via handler.
    return create_persona(
        session,
        responsible_entity_id=payload.responsible_entity_id,
        name=payload.name,
        backstory=payload.backstory,
        voice_tone=payload.voice_tone,
        values=payload.values,
        hard_boundaries=payload.hard_boundaries,
        visual_identity=payload.visual_identity,
    )


@router.get("/{persona_id}", response_model=PersonaOut)
def get(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    persona = session.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="persona not found")
    return persona


@router.get("/{persona_id}/assets", response_model=list[AssetOut])
def list_assets(persona_id: uuid.UUID, session: Session = Depends(get_session)):
    return (
        session.query(Asset)
        .filter(Asset.persona_id == persona_id)
        .order_by(Asset.created_at.desc())
        .all()
    )
