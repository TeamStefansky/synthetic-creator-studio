"""Persona — the disclosed AI character.

C3 is enforced at the schema level here: ``responsible_entity_id`` is NOT NULL,
and ``synthetic_identity`` is a required 1:1 (the service layer guarantees the
two rows are created atomically — see ``app/services/personas.py``).
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PortableJSON, created_at_col, uuid_pk


class Persona(Base):
    __tablename__ = "persona"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    backstory: Mapped[str | None] = mapped_column(Text, nullable=True)
    voice_tone: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Free-form lists kept as JSON for portability.
    values: Mapped[list | None] = mapped_column(PortableJSON, nullable=True)
    # Hard boundaries: things the persona must NEVER say/do.
    hard_boundaries: Mapped[list | None] = mapped_column(PortableJSON, nullable=True)
    # Stored visual identity descriptor used by generation QC for consistency.
    visual_identity: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)

    responsible_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("responsible_entity.id", ondelete="CASCADE"), nullable=False  # C3
    )
    created_at = created_at_col()

    responsible_entity: Mapped["ResponsibleEntity"] = relationship(  # noqa: F821
        back_populates="personas"
    )
    synthetic_identity: Mapped["SyntheticIdentity"] = relationship(  # noqa: F821
        back_populates="persona", uselist=False, cascade="all, delete-orphan"
    )
    assets: Mapped[list["Asset"]] = relationship(  # noqa: F821
        back_populates="persona", cascade="all, delete-orphan"
    )
    lora_models: Mapped[list["LoraModel"]] = relationship(  # noqa: F821
        back_populates="persona", cascade="all, delete-orphan"
    )
