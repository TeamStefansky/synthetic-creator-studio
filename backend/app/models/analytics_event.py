"""AnalyticsEvent — reach/engagement/growth/sentiment per post/persona (M7)."""
from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, PortableJSON, created_at_col, uuid_pk


class AnalyticsEvent(Base):
    __tablename__ = "analytics_event"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("post.id", ondelete="SET NULL"), nullable=True
    )
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    metric: Mapped[str] = mapped_column(String(40), nullable=False)  # reach|engagement|growth|sentiment
    value: Mapped[float] = mapped_column(Float, nullable=False)
    extra: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    created_at = created_at_col()
