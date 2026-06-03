"""Asset — a generated image/video/text emitted by the engine.

``disclosure_status`` is the C1/C2 state machine:
- ``pending``  : created, not yet provenance-stamped → NOT publishable.
- ``tagged``   : provenance manifest embedded + visible label baked → publishable.
- ``blocked``  : failed disclosure or flagged → NEVER publishable.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PortableJSON, created_at_col, uuid_pk


class DisclosureStatus(str, enum.Enum):
    PENDING = "pending"
    TAGGED = "tagged"
    BLOCKED = "blocked"


class AssetKind(str, enum.Enum):
    IMAGE = "image"
    VIDEO = "video"
    TEXT = "text"


class Asset(Base):
    __tablename__ = "asset"

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[AssetKind] = mapped_column(SAEnum(AssetKind), nullable=False)
    # Path/URI of the (labeled) asset bytes in object storage.
    storage_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Path/URI of the sidecar provenance manifest (C2PA-style).
    provenance_manifest_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Cached copy of the manifest for verification/audit.
    provenance_manifest: Mapped[dict | None] = mapped_column(PortableJSON, nullable=True)

    disclosure_status: Mapped[DisclosureStatus] = mapped_column(
        SAEnum(DisclosureStatus), nullable=False, default=DisclosureStatus.PENDING
    )
    prompt: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at = created_at_col()

    persona: Mapped["Persona"] = relationship(back_populates="assets")  # noqa: F821
    posts: Mapped[list["Post"]] = relationship(  # noqa: F821
        back_populates="asset", cascade="all, delete-orphan"
    )
