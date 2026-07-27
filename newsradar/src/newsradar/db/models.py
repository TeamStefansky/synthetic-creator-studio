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


class ContentRights(enum.StrEnum):
    """What a source's licensing lets us persist. Default is always the safest tier."""

    link_only = "link_only"  # title + <=300 char extract; body stays NULL
    extract_ok = "extract_ok"  # title + <=400 char extract; body stays NULL
    full_ok = "full_ok"  # full body may be stored


class WatchlistKind(enum.StrEnum):
    """A watchlist is either an internal monitoring list or a personal interest."""

    monitoring = "monitoring"
    interest = "interest"


class CountryMatchMode(enum.StrEnum):
    """Which country question an interest asks (source-based, subject-based, or either)."""

    source = "source"  # where the outlet is based (sources.country_code)
    subject = "subject"  # what the story is about (document_enrichment.geo.country_code)
    either = "either"


class ApiProvider(enum.StrEnum):
    gdelt = "gdelt"
    perigon = "perigon"


class ImportJobStatus(enum.StrEnum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"


class ImportResultStatus(enum.StrEnum):
    added = "added"
    duplicate = "duplicate"
    no_feed = "no_feed"
    invalid = "invalid"
    error = "error"


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
    # Legacy boolean gate (P1). Retained for backward compatibility; the
    # authoritative licensing gate is ``content_rights`` from P5 onward.
    allows_fulltext_storage: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
    # P5 licensing gate. Default is always the safest tier; upgrading is a
    # deliberate manual API action (never inferred from a feed).
    content_rights: Mapped[ContentRights] = mapped_column(
        _pg_enum(ContentRights, "content_rights"),
        nullable=False,
        server_default=text("'link_only'"),
    )
    rights_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[dt.datetime] = created_at_col()
    updated_at: Mapped[dt.datetime] = updated_at_col()

    documents: Mapped[list[Document]] = relationship(back_populates="source")
    feed_subscriptions: Mapped[list[FeedSubscription]] = relationship(back_populates="source")


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lang_filter: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    country_filter: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    # P5: a watchlist is either an internal monitoring list or a personal interest.
    kind: Mapped[WatchlistKind] = mapped_column(
        _pg_enum(WatchlistKind, "watchlist_kind"),
        nullable=False,
        server_default=text("'monitoring'"),
    )
    # P5 interest targeting. ``source_country`` = where the outlet is based
    # (``sources.country_code``); ``subject_country`` = what the story is about
    # (``document_enrichment.geo.country_code``). These are DIFFERENT questions.
    source_country_filter: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    subject_country_filter: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    country_match_mode: Mapped[CountryMatchMode] = mapped_column(
        _pg_enum(CountryMatchMode, "country_match_mode"),
        nullable=False,
        server_default=text("'either'"),
    )
    # P5 hybrid matching: embedding of ``"query: " + description`` and the
    # minimum cosine similarity for a semantic-only interest match.
    description_embedding: Mapped[Any | None] = mapped_column(Vector(1024), nullable=True)
    min_semantic_similarity: Mapped[float] = mapped_column(
        Float, nullable=False, server_default=text("0.78")
    )
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
    # Summary generation bookkeeping (drives the >=50% regeneration rule).
    summary_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_doc_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
# Trends (P3) — a term/entity whose share of coverage is surging vs its own baseline
# --------------------------------------------------------------------------------------


class Trend(Base):
    """A surging term or entity for a watchlist (distinct from an event).

    A trend is detected when a term/entity's share of the watchlist's documents in
    the current window is a multiple of its trailing-7-day share (with volume and
    source-diversity floors). One row per ``(watchlist_id, term, term_kind)``;
    ``first_detected_at`` is preserved across refreshes so "new trend" alerts can
    fire exactly once.
    """

    __tablename__ = "trends"
    __table_args__ = (
        UniqueConstraint("watchlist_id", "term", "term_kind", name="uq_trends_wl_term_kind"),
        Index("ix_trends_watchlist", "watchlist_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    term: Mapped[str] = mapped_column(Text, nullable=False)
    term_kind: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'topic'"))
    current_share: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    baseline_share: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    lift: Mapped[float] = mapped_column(Float, nullable=False, server_default=text("0"))
    doc_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    representative_event_ids: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )
    first_detected_at: Mapped[dt.datetime] = mapped_column(
        _tstz(), nullable=False, server_default=func.now()
    )
    created_at: Mapped[dt.datetime] = created_at_col()
    updated_at: Mapped[dt.datetime] = updated_at_col()


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


# --------------------------------------------------------------------------------------
# LLM cost accounting (P2)
# --------------------------------------------------------------------------------------


class LlmCall(Base):
    """One structured LLM call, with per-call token accounting for the cost guard."""

    __tablename__ = "llm_calls"
    __table_args__ = (Index("ix_llm_calls_created_at", text("created_at DESC")),)

    id: Mapped[uuid.UUID] = uuid_pk()
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ok: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        _tstz(), nullable=False, server_default=func.now()
    )


# --------------------------------------------------------------------------------------
# Sources layer (P5): presentation metadata, feed subscriptions, batch import, API sources
# --------------------------------------------------------------------------------------


class DocumentMedia(Base):
    """Presentation metadata for a document so P7 can render article-grade cards.

    Only the image *URL* is stored — images are never downloaded, cached, resized
    or re-hosted (hotlinking with attribution is the legally safe posture).
    """

    __tablename__ = "document_media"

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_alt: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_site_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    byline: Mapped[str | None] = mapped_column(Text, nullable=True)
    frameable: Mapped[bool | None] = mapped_column(nullable=True)
    fetched_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)


class DomainFrameability(Base):
    """Per-domain cache of whether the domain permits us to iframe its pages.

    Re-checked monthly; ``frameable`` is NULL when it could not be determined.
    """

    __tablename__ = "domain_frameability"

    domain: Mapped[str] = mapped_column(Text, primary_key=True)
    frameable: Mapped[bool | None] = mapped_column(nullable=True)
    checked_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)


class FeedSubscription(Base):
    """One subscribed RSS/Atom feed, polled alongside ``config/feeds.yaml``."""

    __tablename__ = "feed_subscriptions"
    __table_args__ = (Index("ix_feed_subscriptions_source", "source_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    feed_url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    country_code: Mapped[str | None] = mapped_column(CHAR(2), nullable=True)
    lang: Mapped[str | None] = mapped_column(String(8), nullable=True)
    poll_interval_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("600")
    )
    active: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    last_polled_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    last_ok_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    etag: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_modified: Mapped[str | None] = mapped_column(Text, nullable=True)
    deactivated_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = created_at_col()

    source: Mapped[Source] = relationship(back_populates="feed_subscriptions")


class SourceImportJob(Base):
    """A batch source-onboarding job (up to 500 pasted lines / an OPML upload)."""

    __tablename__ = "source_import_jobs"

    id: Mapped[uuid.UUID] = uuid_pk()
    status: Mapped[ImportJobStatus] = mapped_column(
        _pg_enum(ImportJobStatus, "import_job_status"),
        nullable=False,
        server_default=text("'pending'"),
    )
    total: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[dt.datetime] = created_at_col()
    finished_at: Mapped[dt.datetime | None] = mapped_column(_tstz(), nullable=True)

    results: Mapped[list[SourceImportResult]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class SourceImportResult(Base):
    """The per-line outcome of a batch source-onboarding job."""

    __tablename__ = "source_import_results"
    __table_args__ = (Index("ix_source_import_results_job", "job_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("source_import_jobs.id", ondelete="CASCADE"), nullable=False
    )
    input_line: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ImportResultStatus] = mapped_column(
        _pg_enum(ImportResultStatus, "import_result_status"), nullable=False
    )
    feed_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[SourceImportJob] = relationship(back_populates="results")


class ApiSource(Base):
    """A global-provider (GDELT/Perigon) query scope, so the user can pull from a
    provider scoped to chosen countries without subscribing to individual outlets."""

    __tablename__ = "api_sources"

    id: Mapped[uuid.UUID] = uuid_pk()
    provider: Mapped[ApiProvider] = mapped_column(
        _pg_enum(ApiProvider, "api_provider"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(nullable=False, server_default=text("true"))
    country_filter: Mapped[list[str] | None] = mapped_column(ARRAY(CHAR(2)), nullable=True)
    lang_filter: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    extra_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[dt.datetime] = created_at_col()
