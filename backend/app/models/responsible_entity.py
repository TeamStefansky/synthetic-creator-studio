"""C3 — the named, accountable entity behind every persona."""
from __future__ import annotations

import uuid

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk


class ResponsibleEntity(Base):
    __tablename__ = "responsible_entity"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Legal/accountable name of the brand, org, or person who answers for the persona.
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="brand")  # brand|org|person
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False)
    jurisdiction: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at = created_at_col()

    personas: Mapped[list["Persona"]] = relationship(  # noqa: F821
        back_populates="responsible_entity", cascade="all, delete-orphan"
    )
