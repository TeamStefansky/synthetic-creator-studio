"""Responsible-entity service (C3 — the accountable party)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.responsible_entity import ResponsibleEntity


def create_responsible_entity(
    session: Session, *, name: str, contact_email: str, kind: str = "brand", jurisdiction: str | None = None
) -> ResponsibleEntity:
    if not name or not name.strip():
        raise ValueError("responsible_entity.name is required (C3)")
    if not contact_email or "@" not in contact_email:
        raise ValueError("responsible_entity.contact_email is required (C3)")
    entity = ResponsibleEntity(
        name=name.strip(), contact_email=contact_email, kind=kind, jurisdiction=jurisdiction
    )
    session.add(entity)
    session.flush()
    return entity
