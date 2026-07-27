"""reader layer: translations, editions, share links, report_type (P6)

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-27 16:00:00.000000

Adds the reader product tables — cached ``translations`` (keyed by content hash),
immutable ``editions`` + ``edition_items`` snapshots, revocable ``share_links`` —
and the ``report_type`` discriminator on ``report_schedules``/``reports`` so the
existing analyst reports keep working unchanged (default ``analyst``).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# --- native enum types (created explicitly; models declare create_type=False) --------

TRANSLATION_FIELD = postgresql.ENUM(
    "title", "extract", "body", name="translation_field", create_type=False
)
STORY_TYPE = postgresql.ENUM("event", "document", name="story_type", create_type=False)
SHARE_SCOPE = postgresql.ENUM(
    "site", "edition", "interest", "digest", name="share_scope", create_type=False
)
REPORT_TYPE = postgresql.ENUM("analyst", "headline_digest", name="report_type", create_type=False)

_ALL_ENUMS = (TRANSLATION_FIELD, STORY_TYPE, SHARE_SCOPE, REPORT_TYPE)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in _ALL_ENUMS:
        enum_type.create(bind, checkfirst=True)

    # --- report_type on report_schedules and reports (default keeps analyst path) ---
    op.add_column(
        "report_schedules",
        sa.Column("report_type", REPORT_TYPE, nullable=False, server_default=sa.text("'analyst'")),
    )
    op.add_column(
        "reports",
        sa.Column("report_type", REPORT_TYPE, nullable=False, server_default=sa.text("'analyst'")),
    )

    # --- translations (cache keyed by content_hash) ---
    op.create_table(
        "translations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_lang", sa.String(length=8), nullable=False),
        sa.Column("field", TRANSLATION_FIELD, nullable=False),
        sa.Column("source_lang", sa.String(length=8), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.CHAR(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "target_lang", "field", name="uq_translations_doc_lang_field"
        ),
    )
    op.create_index(
        "ix_translations_hash_field",
        "translations",
        ["content_hash", "field", "target_lang"],
    )

    # --- editions ---
    op.create_table(
        "editions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("lookback_hours", sa.Integer(), nullable=False),
        sa.Column("item_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("config_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_editions_generated_at", "editions", [sa.text("generated_at DESC")])

    # --- edition_items ---
    op.create_table(
        "edition_items",
        sa.Column("edition_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("section", sa.Text(), nullable=False),
        sa.Column("story_type", STORY_TYPE, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("personal_score", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("blurb", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["edition_id"], ["editions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("edition_id", "position"),
        sa.CheckConstraint(
            "(event_id IS NOT NULL)::int + (document_id IS NOT NULL)::int = 1",
            name="ck_edition_items_one_target",
        ),
    )
    op.create_index("ix_edition_items_edition", "edition_items", ["edition_id"])

    # --- share_links ---
    op.create_table(
        "share_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("token", sa.CHAR(length=43), nullable=False),
        sa.Column("scope", SHARE_SCOPE, nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("view_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_share_links_token"),
    )
    op.create_index("ix_share_links_token", "share_links", ["token"])


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_share_links_token", table_name="share_links")
    op.drop_table("share_links")
    op.drop_index("ix_edition_items_edition", table_name="edition_items")
    op.drop_table("edition_items")
    op.drop_index("ix_editions_generated_at", table_name="editions")
    op.drop_table("editions")
    op.drop_index("ix_translations_hash_field", table_name="translations")
    op.drop_table("translations")

    op.drop_column("reports", "report_type")
    op.drop_column("report_schedules", "report_type")

    for enum_type in reversed(_ALL_ENUMS):
        enum_type.drop(bind, checkfirst=True)
