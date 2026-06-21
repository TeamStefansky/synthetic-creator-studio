"""TrainingImage — a reference image uploaded to train a persona's likeness.

These form the dataset for per-persona training (KREA Train / LoRA). Training is
gated by a non-impersonation attestation (C4): the uploader must affirm the
subject is a synthetic/owned character, not a real person's unlicensed likeness.
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk


class TrainingImage(Base):
    __tablename__ = "training_image"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    storage_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False, default="image/png")
    created_at = created_at_col()

    persona: Mapped["Persona"] = relationship()  # noqa: F821
