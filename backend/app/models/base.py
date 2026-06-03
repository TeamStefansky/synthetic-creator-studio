"""Declarative base + portable column types (Postgres-ready, SQLite-safe).

- ``GUID``: native ``UUID`` on Postgres, ``CHAR(36)`` on SQLite.
- ``JSONB`` on Postgres, ``JSON`` elsewhere.
- timezone-aware timestamps with DB-side defaults.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CHAR, DateTime, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, mapped_column
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


class GUID(TypeDecorator):
    """Platform-independent UUID type."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        return value if dialect.name == "postgresql" else str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


# JSON portable type: JSONB on Postgres, JSON elsewhere.
PortableJSON = JSON().with_variant(JSONB(), "postgresql")


def uuid_pk():
    return mapped_column(GUID(), primary_key=True, default=uuid.uuid4)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def created_at_col():
    return mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
