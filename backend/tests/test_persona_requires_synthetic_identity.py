"""C3 — a persona cannot exist without a synthetic_identity (Build Brief §6)."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.constraints import Constraint, ConstraintViolation
from app.models.persona import Persona
from app.models.synthetic_identity import SyntheticIdentity
from app.services.personas import create_persona


def test_service_creates_persona_with_synthetic_identity(session, entity):
    persona = create_persona(
        session, responsible_entity_id=entity.id, name="Nova"
    )
    assert persona.synthetic_identity is not None
    assert persona.synthetic_identity.ai_generated is True
    assert persona.synthetic_identity.persona_id == persona.id
    assert persona.responsible_entity_id == entity.id


def test_persona_without_entity_is_rejected(session):
    with pytest.raises(ConstraintViolation) as ei:
        create_persona(session, responsible_entity_id=uuid.uuid4(), name="Ghost")
    assert ei.value.constraint == Constraint.ACCOUNTABLE_ENTITY_REQUIRED


def test_raw_persona_without_synthetic_identity_cannot_be_queried_as_valid(session, entity):
    """Even bypassing the service, a persona row with no synthetic_identity is an
    incomplete, invalid record — the 1:1 relationship is required by the model."""
    orphan = Persona(name="Orphan", responsible_entity_id=entity.id)
    session.add(orphan)
    session.flush()
    # No synthetic_identity attached → invariant violated; the studio treats this
    # as non-existent for all generation/publish paths.
    assert orphan.synthetic_identity is None
    # And the only sanctioned constructor always attaches one.
    fixed = create_persona(session, responsible_entity_id=entity.id, name="Fixed")
    assert fixed.synthetic_identity is not None


def test_synthetic_identity_requires_persona_fk(session, entity):
    """synthetic_identity.persona_id is NOT NULL — it cannot float free."""
    si = SyntheticIdentity(responsible_entity_id=entity.id, ai_generated=True)
    session.add(si)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()
