"""Complete NewsRadar data model (14 tables) in SQLAlchemy 2.0 declarative style.

Native Postgres enums are declared with ``create_type=False``; the enum types are
created explicitly by the Alembic migration. Vector columns use ``pgvector``.
"""

from __future__ import annotations

import datetime as dt
import enum
import uuid
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from newsradar.db.base import Base, created_at_col, updated_at_col, uuid_pk

# --------------------------------------------------------------------------------------
# Enums (native Postgres types)
# --------------------------------------------------------------------------------------


class SourceType(enum.StrEnum):
    news = "news"
    social = "social"
    forum = "forum"
    broadcast = "broadcast"
    blog = "blog"
    aggregator = "aggregator"


class TermType(enum.StrEnum):
    keyword = "keyword"
    phrase = "phrase"
    boolean = "boolean"
    entity_alias = "entity_alias"


class EntityType(enum.StrEnum):
    person = "person"
    org = "org"
    product = "product"
    place = "place"
    brand = "brand"


class MediaType(enum.StrEnum):
    article = "article"
    post = "post"
    comment = "comment"
    video = "video"
    broadcast_transcript = "broadcast_transcript"


class EventStatus(enum.StrEnum):
    emerging = "emerging"
    active = "active"
    decaying = "decaying"
    closed = "closed"


class AlertSeverity(enum.StrEnum):
    info = "info"
    warning = "warning"
    critical = "critical"


class ReportFormat(enum.StrEnum):
    markdown = "markdown"
    html = "html"
    pdf = "pdf"


def _tstz() -> DateTime:
    """Timezone-aware timestamp column type (``TIMESTAMPTZ``)."""

    return DateTime(timezone=True)


def _pg_enum(py_enum: type[enum.Enum], name: str) -> Enum:
    """Build a native Postgres enum column type (created by the migration)."""

    return Enum(
        py_enum,
        name=name,
        native_enum=True,
        create_type=False,
        values_callable=lambda e: [member.value for member in e],
    )


# --------------------------------------------------------------------------------------
# Sources & watchlists
# --------------------------------------------------------------------------------------


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint("tier BETWEEN 1 AND 4", name="ck_sources_tier"),
        CheckConstraint("credibility_score BETWEEN 0 AND 1", name="ck_sources_credibility"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source_type: Mapped[SourceType] = mapped_column(
        _pg_enum(SourceType, "source_type"), nullable=False
    )
    platform: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_code: Mapped[str | None] = mapped_column(CHAR(2), nullable=True)
    lang: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tier: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    credibility_score: Mapped[float] = mapped_column(
        Float, nullable=False, server_default=text("0.5")
    )
    allows_fulltext_storage: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[dt.datetime] = created_at_col()
    updated_at: Mapped[dt.datetime] = updated_at_col()

    documents: Mapped[list[Document]] = relationship(back_populates="source")


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lang_filter: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    country_filter: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    created_at: Mapped[dt.datetime] = created_at_col()
    updated_at: Mapped[dt.datetime] = updated_at_col()

    terms: Mapped[list[WatchlistTerm]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan"
    )
    entities: Mapped[list[WatchlistEntity]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan"
    )


class WatchlistTerm(Base):
    __tablename__ = "watchlist_terms"
    __table_args__ = (
        UniqueConstraint("watchlist_id", "term", "lang", name="uq_watchlist_terms_wl_term_lang"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    term: Mapped[str] = mapped_column(Text, nullable=False)
    term_type: Mapped[TermType] = mapped_column(_pg_enum(TermType, "term_type"), nullable=False)
    lang: Mapped[str | None] = mapped_column(String(8), nullable=True)
    is_exclusion: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))
    weight: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("1.0"))

    watchlist: Mapped[Watchlist] = relationship(back_populates="terms")


class WatchlistEntity(Base):
    __tablename__ = "watchlist_entities"

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[EntityType] = mapped_column(
        _pg_enum(EntityType, "entity_type"), nullable=False
    )
    aliases: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    is_primary: Mapped[bool] = mapped_column(nullable=False, server_default=text("false"))

    watchlist: Mapped[Watchlist] = relationship(back_populates="entities")


# --------------------------------------------------------------------------------------
# Documents & derived data
# --------------------------------------------------------------------------------------


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index(
            "ix_documents_published_source",
            text("published_at DESC"),
            "source_id",
        ),
        Index("ix_documents_simhash", "simhash"),
        Index("ix_documents_published_at", "published_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"), nullable=False)
    external_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_url: Mapped[str] = mapped_column(Text, nullable=False)
    url_hash: Mapped[str] = mapped_column(CHAR(64), unique=True, nullable=False)
    simhash: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    lang: Mapped[str | None] = mapped_column(String(8), nullable=True)
    published_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    fetched_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_type: Mapped[MediaType] = mapped_column(_pg_enum(MediaType, "media_type"), nullable=False)
    engagement: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    dedup_of: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id"), nullable=True)

    source: Mapped[Source] = relationship(back_populates="documents")
    enrichment: Mapped[DocumentEnrichment | None] = relationship(
        back_populates="document", cascade="all, delete-orphan", uselist=False
    )
    matches: Mapped[list[DocumentMatch]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    stance_assessments: Mapped[list[StanceAssessment]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentMatch(Base):
    __tablename__ = "document_matches"
    __table_args__ = (
        UniqueConstraint("document_id", "watchlist_id", name="uq_document_matches_doc_wl"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    matched_terms: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    document: Mapped[Document] = relationship(back_populates="matches")


class DocumentEnrichment(Base):
    __tablename__ = "document_enrichment"
    __table_args__ = (
        CheckConstraint("sentiment_overall BETWEEN -1 AND 1", name="ck_enrichment_sentiment"),
        CheckConstraint("prominence BETWEEN 0 AND 1", name="ck_enrichment_prominence"),
        Index(
            "ix_document_enrichment_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[Any | None] = mapped_column(Vector(1024), nullable=True)
    entities: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    topics: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    geo: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    sentiment_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    prominence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_opinion: Mapped[bool | None] = mapped_column(nullable=True)
    enriched_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    model_version: Mapped[str | None] = mapped_column(Text, nullable=True)

    document: Mapped[Document] = relationship(back_populates="enrichment")


class StanceAssessment(Base):
    __tablename__ = "stance_assessments"
    __table_args__ = (
        CheckConstraint("stance BETWEEN -2 AND 2", name="ck_stance_range"),
        UniqueConstraint("document_id", "entity_id", name="uq_stance_assessments_doc_entity"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlist_entities.id"), nullable=False
    )
    stance: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_span: Mapped[str | None] = mapped_column(Text, nullable=True)
    framing: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = created_at_col()

    document: Mapped[Document] = relationship(back_populates="stance_assessments")


# --------------------------------------------------------------------------------------
# Events & metrics
# --------------------------------------------------------------------------------------


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index(
            "ix_events_watchlist_status_lastseen",
            "watchlist_id",
            "status",
            text("last_seen_at DESC"),
        ),
        Index(
            "ix_events_centroid_hnsw",
            "centroid",
            postgresql_using="hnsw",
            postgresql_ops={"centroid": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    centroid: Mapped[Any | None] = mapped_column(Vector(1024), nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        _pg_enum(EventStatus, "event_status"),
        nullable=False,
        server_default=text("'emerging'"),
    )
    first_seen_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    last_seen_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    doc_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    country_codes: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    geo_centroid: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    heat_score: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    negativity_score: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    created_at: Mapped[dt.datetime] = created_at_col()
    updated_at: Mapped[dt.datetime] = updated_at_col()

    documents: Mapped[list[EventDocument]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    metrics: Mapped[list[EventMetric]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    alerts: Mapped[list[Alert]] = relationship(back_populates="event", cascade="all, delete-orphan")


class EventDocument(Base):
    __tablename__ = "event_documents"

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    added_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)

    event: Mapped[Event] = relationship(back_populates="documents")


class EventMetric(Base):
    __tablename__ = "event_metrics"
    __table_args__ = (
        UniqueConstraint("event_id", "bucket_at", name="uq_event_metrics_event_bucket"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    bucket_at: Mapped[dt.datetime] = mapped_column(_tstz(), nullable=False)
    doc_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    velocity: Mapped[float | None] = mapped_column(Float, nullable=True)
    acceleration: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_diversity: Mapped[float | None] = mapped_column(Float, nullable=True)
    negativity_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    cross_platform_lift: Mapped[float | None] = mapped_column(Float, nullable=True)
    heat_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    event: Mapped[Event] = relationship(back_populates="metrics")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        _pg_enum(AlertSeverity, "alert_severity"), nullable=False
    )
    fired_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    delivered_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    event: Mapped[Event] = relationship(back_populates="alerts")


# --------------------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------------------


class ReportSchedule(Base):
    __tablename__ = "report_schedules"

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    cron: Mapped[str] = mapped_column(Text, nullable=False)
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'Asia/Jerusalem'")
    )
    sections: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    recipients: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    format: Mapped[ReportFormat] = mapped_column(
        _pg_enum(ReportFormat, "report_format"), nullable=False
    )
    lookback_hours: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("24"))
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    last_run_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)

    reports: Mapped[list[Report]] = relationship(back_populates="schedule")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("watchlists.id"), nullable=False)
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("report_schedules.id"), nullable=True
    )
    period_start: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    period_end: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    generated_at: Mapped[dt.datetime] = created_at_col()
    markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    html: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_ids: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )

    schedule: Mapped[ReportSchedule | None] = relationship(back_populates="reports")


# --------------------------------------------------------------------------------------
# Ingestion bookkeeping (P1)
# --------------------------------------------------------------------------------------


class IngestionRun(Base):
    """One connector×watchlist ingestion run, with per-run counters for observability."""

    __tablename__ = "ingestion_runs"
    __table_args__ = (
        Index("ix_ingestion_runs_started_at", text("started_at DESC")),
        Index("ix_ingestion_runs_connector", "connector"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    connector: Mapped[str] = mapped_column(Text, nullable=False)
    watchlist_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("watchlists.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'running'"))
    fetched: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    inserted: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    duplicates: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    errors: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    started_at: Mapped[dt.datetime] = mapped_column(
        _tstz(), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
