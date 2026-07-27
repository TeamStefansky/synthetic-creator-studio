"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-27 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --- native enum types ---------------------------------------------------------------

SOURCE_TYPE = postgresql.ENUM(
    "news",
    "social",
    "forum",
    "broadcast",
    "blog",
    "aggregator",
    name="source_type",
    create_type=False,
)
TERM_TYPE = postgresql.ENUM(
    "keyword",
    "phrase",
    "boolean",
    "entity_alias",
    name="term_type",
    create_type=False,
)
ENTITY_TYPE = postgresql.ENUM(
    "person",
    "org",
    "product",
    "place",
    "brand",
    name="entity_type",
    create_type=False,
)
MEDIA_TYPE = postgresql.ENUM(
    "article",
    "post",
    "comment",
    "video",
    "broadcast_transcript",
    name="media_type",
    create_type=False,
)
EVENT_STATUS = postgresql.ENUM(
    "emerging",
    "active",
    "decaying",
    "closed",
    name="event_status",
    create_type=False,
)
ALERT_SEVERITY = postgresql.ENUM(
    "info",
    "warning",
    "critical",
    name="alert_severity",
    create_type=False,
)
REPORT_FORMAT = postgresql.ENUM(
    "markdown",
    "html",
    "pdf",
    name="report_format",
    create_type=False,
)

_ALL_ENUMS = (
    SOURCE_TYPE,
    TERM_TYPE,
    ENTITY_TYPE,
    MEDIA_TYPE,
    EVENT_STATUS,
    ALERT_SEVERITY,
    REPORT_FORMAT,
)


def upgrade() -> None:
    bind = op.get_bind()

    # Extension + enum types
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    for enum_type in _ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    # --- sources ---
    op.create_table(
        "sources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("source_type", SOURCE_TYPE, nullable=False),
        sa.Column("platform", sa.Text(), nullable=True),
        sa.Column("country_code", sa.CHAR(length=2), nullable=True),
        sa.Column("lang", sa.String(length=8), nullable=True),
        sa.Column("tier", sa.SmallInteger(), nullable=False),
        sa.Column("credibility_score", sa.Float(), server_default=sa.text("0.5"), nullable=False),
        sa.Column(
            "allows_fulltext_storage", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("tier BETWEEN 1 AND 4", name="ck_sources_tier"),
        sa.CheckConstraint("credibility_score BETWEEN 0 AND 1", name="ck_sources_credibility"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain", name="uq_sources_domain"),
    )

    # --- watchlists ---
    op.create_table(
        "watchlists",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("lang_filter", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("country_filter", postgresql.ARRAY(sa.CHAR(length=2)), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_watchlists_name"),
    )

    # --- watchlist_terms ---
    op.create_table(
        "watchlist_terms",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("term", sa.Text(), nullable=False),
        sa.Column("term_type", TERM_TYPE, nullable=False),
        sa.Column("lang", sa.String(length=8), nullable=True),
        sa.Column("is_exclusion", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("weight", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("watchlist_id", "term", "lang", name="uq_watchlist_terms_wl_term_lang"),
    )

    # --- watchlist_entities ---
    op.create_table(
        "watchlist_entities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("entity_type", ENTITY_TYPE, nullable=False),
        sa.Column("aliases", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- documents ---
    op.create_table(
        "documents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("canonical_url", sa.Text(), nullable=False),
        sa.Column("url_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("simhash", sa.BigInteger(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("lang", sa.String(length=8), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("author", sa.Text(), nullable=True),
        sa.Column("media_type", MEDIA_TYPE, nullable=False),
        sa.Column("engagement", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("dedup_of", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.ForeignKeyConstraint(["dedup_of"], ["documents.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url_hash", name="uq_documents_url_hash"),
    )
    op.create_index("ix_documents_simhash", "documents", ["simhash"])
    op.create_index("ix_documents_published_at", "documents", ["published_at"])
    op.create_index(
        "ix_documents_published_source",
        "documents",
        [sa.text("published_at DESC"), "source_id"],
    )

    # --- document_matches ---
    op.create_table(
        "document_matches",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("matched_terms", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("match_score", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "watchlist_id", name="uq_document_matches_doc_wl"),
    )

    # --- document_enrichment ---
    op.create_table(
        "document_enrichment",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(1024), nullable=True),
        sa.Column("entities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("topics", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("geo", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sentiment_overall", sa.Float(), nullable=True),
        sa.Column("prominence", sa.Float(), nullable=True),
        sa.Column("is_opinion", sa.Boolean(), nullable=True),
        sa.Column("enriched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("model_version", sa.Text(), nullable=True),
        sa.CheckConstraint("sentiment_overall BETWEEN -1 AND 1", name="ck_enrichment_sentiment"),
        sa.CheckConstraint("prominence BETWEEN 0 AND 1", name="ck_enrichment_prominence"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id"),
    )
    op.create_index(
        "ix_document_enrichment_embedding_hnsw",
        "document_enrichment",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # --- stance_assessments ---
    op.create_table(
        "stance_assessments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stance", sa.SmallInteger(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("evidence_span", sa.Text(), nullable=True),
        sa.Column("framing", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("stance BETWEEN -2 AND 2", name="ck_stance_range"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["watchlist_entities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "entity_id", name="uq_stance_assessments_doc_entity"),
    )

    # --- events ---
    op.create_table(
        "events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("centroid", pgvector.sqlalchemy.Vector(1024), nullable=True),
        sa.Column("status", EVENT_STATUS, server_default=sa.text("'emerging'"), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("doc_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("source_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("country_codes", postgresql.ARRAY(sa.CHAR(length=2)), nullable=True),
        sa.Column("geo_centroid", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("heat_score", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("negativity_score", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_events_watchlist_status_lastseen",
        "events",
        ["watchlist_id", "status", sa.text("last_seen_at DESC")],
    )
    op.create_index(
        "ix_events_centroid_hnsw",
        "events",
        ["centroid"],
        postgresql_using="hnsw",
        postgresql_ops={"centroid": "vector_cosine_ops"},
    )

    # --- event_documents ---
    op.create_table(
        "event_documents",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id", "document_id"),
    )

    # --- event_metrics ---
    op.create_table(
        "event_metrics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bucket_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("doc_count", sa.Integer(), nullable=True),
        sa.Column("velocity", sa.Float(), nullable=True),
        sa.Column("acceleration", sa.Float(), nullable=True),
        sa.Column("source_diversity", sa.Float(), nullable=True),
        sa.Column("negativity_index", sa.Float(), nullable=True),
        sa.Column("cross_platform_lift", sa.Float(), nullable=True),
        sa.Column("heat_score", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "bucket_at", name="uq_event_metrics_event_bucket"),
    )

    # --- alerts ---
    op.create_table(
        "alerts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_name", sa.Text(), nullable=False),
        sa.Column("severity", ALERT_SEVERITY, nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- report_schedules ---
    op.create_table(
        "report_schedules",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("cron", sa.Text(), nullable=False),
        sa.Column(
            "timezone", sa.Text(), server_default=sa.text("'Asia/Jerusalem'"), nullable=False
        ),
        sa.Column("sections", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("format", REPORT_FORMAT, nullable=False),
        sa.Column("lookback_hours", sa.Integer(), server_default=sa.text("24"), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- reports ---
    op.create_table(
        "reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("artifact_path", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("event_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.ForeignKeyConstraint(["watchlist_id"], ["watchlists.id"]),
        sa.ForeignKeyConstraint(["schedule_id"], ["report_schedules.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_table("reports")
    op.drop_table("report_schedules")
    op.drop_table("alerts")
    op.drop_table("event_metrics")
    op.drop_table("event_documents")
    op.drop_index("ix_events_centroid_hnsw", table_name="events")
    op.drop_index("ix_events_watchlist_status_lastseen", table_name="events")
    op.drop_table("events")
    op.drop_table("stance_assessments")
    op.drop_index("ix_document_enrichment_embedding_hnsw", table_name="document_enrichment")
    op.drop_table("document_enrichment")
    op.drop_table("document_matches")
    op.drop_index("ix_documents_published_source", table_name="documents")
    op.drop_index("ix_documents_published_at", table_name="documents")
    op.drop_index("ix_documents_simhash", table_name="documents")
    op.drop_table("documents")
    op.drop_table("watchlist_entities")
    op.drop_table("watchlist_terms")
    op.drop_table("watchlists")
    op.drop_table("sources")

    for enum_type in reversed(_ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)

    op.execute("DROP EXTENSION IF EXISTS vector")
