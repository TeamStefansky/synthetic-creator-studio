"""narratives + per-post enrichment

Revision ID: 0004_narratives
Revises: 0003_campaigns
Create Date: 2026-07-06

Reversible: adds the narratives table. (posts.sentiment/lang/narrative_id already
exist from 0001.)
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_narratives"
down_revision = "0003_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "narratives",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("keywords", sa.JSON()),
        sa.Column("post_count", sa.Integer()),
        sa.Column("account_count", sa.Integer()),
        sa.Column("sentiment_avg", sa.Float()),
        sa.Column("manipulation_index", sa.Float()),
        sa.Column("first_seen", sa.DateTime(timezone=True)),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("narratives")
