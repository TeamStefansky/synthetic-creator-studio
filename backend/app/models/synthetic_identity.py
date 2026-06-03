"""SyntheticIdentity — REQUIRED 1:1 with persona (C3).

This record is the AI-disclosure anchor: ``ai_generated`` is always true, it
references the responsible entity, and it is the record that stamps every
emitted asset (its id is embedded in each provenance manifest).
"""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk


class SyntheticIdentity(Base):
    __tablename__ = "synthetic_identity"
    __table_args__ = (
        # The disclosure anchor can never claim to be a real human.
        # Bare-column truthiness check is portable across SQLite and Postgres.
        CheckConstraint("ai_generated", name="ck_synthetic_identity_ai_generated"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # Unique => strict 1:1 with persona.
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    responsible_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("responsible_entity.id", ondelete="CASCADE"), nullable=False
    )
    ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at = created_at_col()

    persona: Mapped["Persona"] = relationship(back_populates="synthetic_identity")  # noqa: F821
