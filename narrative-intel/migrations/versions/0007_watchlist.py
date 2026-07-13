"""brand watch phase B: watchlist + threat snapshots

Revision ID: 0007_watchlist
Revises: 0006_post_entity
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_watchlist"
down_revision = "0006_post_entity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watched_entities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("query", sa.String(length=255)),
        sa.Column("enabled", sa.Boolean()),
        sa.Column("last_score", sa.Float()),
        sa.Column("last_status", sa.String(length=16)),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("name", name="uq_watched_entity"),
    )
    op.create_table(
        "threat_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity", sa.String(length=255), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("total_posts", sa.Integer()),
        sa.Column("total_accounts", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_threat_snapshots_entity", "threat_snapshots", ["entity"])


def downgrade() -> None:
    op.drop_index("ix_threat_snapshots_entity", table_name="threat_snapshots")
    op.drop_table("threat_snapshots")
    op.drop_table("watched_entities")
