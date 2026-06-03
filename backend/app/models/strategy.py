"""Strategy — audience/content plan for a named brand (Milestone 5).

Note (C4): strategy models *audience fit for an accountable brand*, not the
impersonation of any population or real individual.
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PortableJSON, created_at_col, uuid_pk


class Strategy(Base):
    __tablename__ = "strategy"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    audience: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    content_pillars: Mapped[list | None] = mapped_column(PortableJSON, nullable=True)
    tone: Mapped[str | None] = mapped_column(String(400), nullable=True)
    recommended_platforms: Mapped[list | None] = mapped_column(PortableJSON, nullable=True)
    themes: Mapped[list | None] = mapped_column(PortableJSON, nullable=True)
    created_at = created_at_col()

    persona: Mapped["Persona"] = relationship()  # noqa: F821
