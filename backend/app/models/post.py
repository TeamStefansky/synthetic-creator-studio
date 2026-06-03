"""Post — a scheduled/published unit of content (Milestone 6)."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk


class ApprovalState(str, enum.Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    PUBLISHED = "published"
    REJECTED = "rejected"
    FAILED = "failed"


class Post(Base):
    __tablename__ = "post"

    id: Mapped[uuid.UUID] = uuid_pk()
    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("asset.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(40), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(2200), nullable=True)
    approval_state: Mapped[ApprovalState] = mapped_column(
        SAEnum(ApprovalState), nullable=False, default=ApprovalState.DRAFT
    )
    scheduled_for: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Platform-side id once published (proof of official-API distribution).
    external_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at = created_at_col()

    asset: Mapped["Asset"] = relationship(back_populates="posts")  # noqa: F821
