"""source layer + keyword/country interests (P5)

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-27 12:00:00.000000

Adds the ``content_rights`` licensing gate (data-migrated from the legacy
boolean ``allows_fulltext_storage``), presentation metadata, feed subscriptions,
batch-import bookkeeping, API-source scopes and the ``watchlists`` interest
columns.
"""

from __future__ import annotations

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --- native enum types (created explicitly; models declare create_type=False) --------

CONTENT_RIGHTS = postgresql.ENUM(
    "link_only", "extract_ok", "full_ok", name="content_rights", create_type=False
)
WATCHLIST_KIND = postgresql.ENUM(
    "monitoring", "interest", name="watchlist_kind", create_type=False
)
COUNTRY_MATCH_MODE = postgresql.ENUM(
    "source", "subject", "either", name="country_match_mode", create_type=False
)
API_PROVIDER = postgresql.ENUM("gdelt", "perigon", name="api_provider", create_type=False)
IMPORT_JOB_STATUS = postgresql.ENUM(
    "pending", "running", "done", "failed", name="import_job_status", create_type=False
)
IMPORT_RESULT_STATUS = postgresql.ENUM(
    "added", "duplicate", "no_feed", "invalid", "error", name="import_result_status",
    create_type=False,
)

_ALL_ENUMS = (
    CONTENT_RIGHTS,
    WATCHLIST_KIND,
    COUNTRY_MATCH_MODE,
    API_PROVIDER,
    IMPORT_JOB_STATUS,
    IMPORT_RESULT_STATUS,
)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in _ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    # --- sources: content_rights (data-migrated from the boolean) + rights_note ---
    op.add_column(
        "sources",
        sa.Column(
            "content_rights",
            CONTENT_RIGHTS,
            nullable=False,
            server_default=sa.text("'link_only'"),
        ),
    )
    op.add_column("sources", sa.Column("rights_note", sa.Text(), nullable=True))
    # Data migration: true -> full_ok, false -> link_only.
    op.execute(
        "UPDATE sources SET content_rights = 'full_ok' WHERE allows_fulltext_storage = true"
    )
    op.execute(
        "UPDATE sources SET content_rights = 'link_only' WHERE allows_fulltext_storage = false"
    )

    # --- watchlists: interest columns ---
    op.add_column(
        "watchlists",
        sa.Column(
            "kind", WATCHLIST_KIND, nullable=False, server_default=sa.text("'monitoring'")
        ),
    )
    op.add_column(
        "watchlists",
        sa.Column("source_country_filter", postgresql.ARRAY(sa.CHAR(length=2)), nullable=True),
    )
    op.add_column(
        "watchlists",
        sa.Column("subject_country_filter", postgresql.ARRAY(sa.CHAR(length=2)), nullable=True),
    )
    op.add_column(
        "watchlists",
        sa.Column(
            "country_match_mode",
            COUNTRY_MATCH_MODE,
            nullable=False,
            server_default=sa.text("'either'"),
        ),
    )
    op.add_column(
        "watchlists",
        sa.Column("description_embedding", pgvector.sqlalchemy.Vector(1024), nullable=True),
    )
    op.add_column(
        "watchlists",
        sa.Column(
            "min_semantic_similarity",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.78"),
        ),
    )

    # --- document_media ---
    op.create_table(
        "document_media",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("image_width", sa.Integer(), nullable=True),
        sa.Column("image_height", sa.Integer(), nullable=True),
        sa.Column("image_alt", sa.Text(), nullable=True),
        sa.Column("og_title", sa.Text(), nullable=True),
        sa.Column("og_description", sa.Text(), nullable=True),
        sa.Column("og_site_name", sa.Text(), nullable=True),
        sa.Column("favicon_url", sa.Text(), nullable=True),
        sa.Column("byline", sa.Text(), nullable=True),
        sa.Column("frameable", sa.Boolean(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id"),
    )

    # --- domain_frameability ---
    op.create_table(
        "domain_frameability",
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("frameable", sa.Boolean(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("domain"),
    )

    # --- feed_subscriptions ---
    op.create_table(
        "feed_subscriptions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feed_url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("country_code", sa.CHAR(length=2), nullable=True),
        sa.Column("lang", sa.String(length=8), nullable=True),
        sa.Column(
            "poll_interval_seconds", sa.Integer(), server_default=sa.text("600"), nullable=False
        ),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ok_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "consecutive_failures", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("etag", sa.Text(), nullable=True),
        sa.Column("last_modified", sa.Text(), nullable=True),
        sa.Column("deactivated_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feed_url", name="uq_feed_subscriptions_feed_url"),
    )
    op.create_index("ix_feed_subscriptions_source", "feed_subscriptions", ["source_id"])

    # --- source_import_jobs ---
    op.create_table(
        "source_import_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "status", IMPORT_JOB_STATUS, server_default=sa.text("'pending'"), nullable=False
        ),
        sa.Column("total", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("processed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- source_import_results ---
    op.create_table(
        "source_import_results",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("input_line", sa.Text(), nullable=False),
        sa.Column("normalized_url", sa.Text(), nullable=True),
        sa.Column("status", IMPORT_RESULT_STATUS, nullable=False),
        sa.Column("feed_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["job_id"], ["source_import_jobs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_source_import_results_job", "source_import_results", ["job_id"])

    # --- api_sources ---
    op.create_table(
        "api_sources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("provider", API_PROVIDER, nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("country_filter", postgresql.ARRAY(sa.CHAR(length=2)), nullable=True),
        sa.Column("lang_filter", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("extra_params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_table("api_sources")
    op.drop_index("ix_source_import_results_job", table_name="source_import_results")
    op.drop_table("source_import_results")
    op.drop_table("source_import_jobs")
    op.drop_index("ix_feed_subscriptions_source", table_name="feed_subscriptions")
    op.drop_table("feed_subscriptions")
    op.drop_table("domain_frameability")
    op.drop_table("document_media")

    op.drop_column("watchlists", "min_semantic_similarity")
    op.drop_column("watchlists", "description_embedding")
    op.drop_column("watchlists", "country_match_mode")
    op.drop_column("watchlists", "subject_country_filter")
    op.drop_column("watchlists", "source_country_filter")
    op.drop_column("watchlists", "kind")

    op.drop_column("sources", "rights_note")
    op.drop_column("sources", "content_rights")

    for enum_type in reversed(_ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)
