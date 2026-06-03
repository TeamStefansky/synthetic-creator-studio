"""Persona service — the ONLY sanctioned way to create a persona.

Enforces C3: a persona is created **atomically** with its 1:1
``synthetic_identity`` and a non-null ``responsible_entity``. There is no code
path that yields a persona without a synthetic identity — the two rows are added
in the same flush, and a failure rolls back both.

Enforces C4: the persona's descriptive fields are screened so a persona cannot
be defined as a real human or to impersonate a named individual.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.constraints import Constraint, ConstraintViolation
from app.models.persona import Persona
from app.models.responsible_entity import ResponsibleEntity
from app.models.synthetic_identity import SyntheticIdentity
from app.safety.real_person import RealPersonGuard

_guard = RealPersonGuard()


def create_persona(
    session: Session,
    *,
    responsible_entity_id,
    name: str,
    backstory: str | None = None,
    voice_tone: str | None = None,
    values: list | None = None,
    hard_boundaries: list | None = None,
    visual_identity: dict | None = None,
) -> Persona:
    """Create a persona + its required synthetic_identity atomically (C3)."""
    entity = session.get(ResponsibleEntity, responsible_entity_id)
    if entity is None:
        # C3 — no persona without a named, accountable entity.
        raise ConstraintViolation(
            Constraint.ACCOUNTABLE_ENTITY_REQUIRED,
            f"responsible_entity {responsible_entity_id} does not exist — "
            "a persona must map to an accountable entity",
        )

    # C4 — screen descriptive content for real-person impersonation.
    _guard.assert_clear(name, backstory, voice_tone, context="persona definition")

    persona = Persona(
        name=name,
        backstory=backstory,
        voice_tone=voice_tone,
        values=values,
        hard_boundaries=hard_boundaries,
        visual_identity=visual_identity,
        responsible_entity_id=entity.id,
    )
    # Attach the REQUIRED synthetic identity in the same unit of work (C3).
    persona.synthetic_identity = SyntheticIdentity(
        responsible_entity_id=entity.id,
        ai_generated=True,
    )
    session.add(persona)
    session.flush()

    # Belt-and-suspenders invariant check (C3) — fail closed if somehow absent.
    if persona.synthetic_identity is None or persona.synthetic_identity.id is None:
        raise ConstraintViolation(
            Constraint.ACCOUNTABLE_ENTITY_REQUIRED,
            "persona created without a synthetic_identity — refusing (C3)",
        )
    return persona
