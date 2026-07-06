"""authenticity signal breakdown per author

Revision ID: 0002_author_signals
Revises: 0001_initial
Create Date: 2026-07-06

Reversible: adds the author_signals table.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_author_signals"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "author_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("authors.id"), nullable=False),
        sa.Column("name", sa.String(length=48), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("explanation", sa.Text()),
        sa.Column("computed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("author_id", "name", name="uq_author_signal"),
    )
    op.create_index("ix_author_signals_author_id", "author_signals", ["author_id"])


def downgrade() -> None:
    op.drop_table("author_signals")
