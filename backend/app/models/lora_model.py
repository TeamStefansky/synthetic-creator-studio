"""LoraModel — per-persona trained adapter (Milestone 3)."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PortableJSON, created_at_col, uuid_pk


class LoraModel(Base):
    __tablename__ = "lora_model"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    base_model: Mapped[str] = mapped_column(String(120), nullable=False)
    # Training metadata: dataset ref, steps, rank, etc.
    training_meta: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)
    # Pointer to the adapter weights in object storage (stub-friendly).
    weights_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="registered")
    created_at = created_at_col()

    persona: Mapped["Persona"] = relationship(back_populates="lora_models")  # noqa: F821
