"""Declarative base and shared column/type helpers for all ORM models."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all NewsRadar ORM models."""


def uuid_pk() -> Mapped[uuid.UUID]:
    """UUID primary key with a server-side ``gen_random_uuid()`` default."""

    return mapped_column(
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )


def created_at_col() -> Mapped[dt.datetime]:
    """Timezone-aware creation timestamp defaulting to ``now()`` server-side."""

    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


def updated_at_col() -> Mapped[dt.datetime]:
    """Timezone-aware update timestamp maintained on insert and update."""

    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
