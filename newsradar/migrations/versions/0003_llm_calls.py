"""llm_calls + event summary bookkeeping

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-27 08:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "llm_calls",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("ok", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_llm_calls_created_at",
        "llm_calls",
        [sa.literal_column("created_at DESC")],
        unique=False,
    )

    # Event summary regeneration bookkeeping.
    op.add_column("events", sa.Column("summary_model", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("summary_doc_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "summary_doc_count")
    op.drop_column("events", "summary_model")
    op.drop_index("ix_llm_calls_created_at", table_name="llm_calls")
    op.drop_table("llm_calls")
