"""trends table (P3 signal engine)

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-27 09:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trends",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("watchlist_id", sa.Uuid(), nullable=False),
        sa.Column("term", sa.Text(), nullable=False),
        sa.Column("term_kind", sa.Text(), server_default=sa.text("'topic'"), nullable=False),
        sa.Column("current_share", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("baseline_share", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("lift", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("doc_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("source_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "representative_event_ids",
            postgresql.ARRAY(sa.Uuid()),
            nullable=True,
        ),
        sa.Column(
            "first_detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
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
        sa.UniqueConstraint("watchlist_id", "term", "term_kind", name="uq_trends_wl_term_kind"),
    )
    op.create_index("ix_trends_watchlist", "trends", ["watchlist_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trends_watchlist", table_name="trends")
    op.drop_table("trends")
