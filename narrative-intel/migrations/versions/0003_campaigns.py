"""coordinated-behaviour: campaigns + relationship graph

Revision ID: 0003_campaigns
Revises: 0002_author_signals
Create Date: 2026-07-06

Reversible: adds campaigns, campaign_accounts, campaign_evidence, coordination_edges.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_campaigns"
down_revision = "0002_author_signals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("sample_text", sa.Text(), nullable=False),
        sa.Column("coordination_score", sa.Float(), nullable=False),
        sa.Column("account_count", sa.Integer(), nullable=False),
        sa.Column("post_count", sa.Integer(), nullable=False),
        sa.Column("time_start", sa.DateTime(timezone=True)),
        sa.Column("time_end", sa.DateTime(timezone=True)),
        sa.Column("sources", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_campaigns_content_hash", "campaigns", ["content_hash"])

    op.create_table(
        "campaign_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("authors.id"), nullable=False),
        sa.UniqueConstraint("campaign_id", "author_id", name="uq_campaign_account"),
    )
    op.create_index("ix_campaign_accounts_campaign_id", "campaign_accounts", ["campaign_id"])
    op.create_index("ix_campaign_accounts_author_id", "campaign_accounts", ["author_id"])

    op.create_table(
        "campaign_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id"), nullable=False),
    )
    op.create_index("ix_campaign_evidence_campaign_id", "campaign_evidence", ["campaign_id"])

    op.create_table(
        "coordination_edges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("author_a", sa.Integer(), sa.ForeignKey("authors.id"), nullable=False),
        sa.Column("author_b", sa.Integer(), sa.ForeignKey("authors.id"), nullable=False),
        sa.Column("weight", sa.Integer()),
        sa.UniqueConstraint("author_a", "author_b", name="uq_coordination_edge"),
    )
    op.create_index("ix_coordination_edges_author_a", "coordination_edges", ["author_a"])
    op.create_index("ix_coordination_edges_author_b", "coordination_edges", ["author_b"])


def downgrade() -> None:
    op.drop_table("coordination_edges")
    op.drop_table("campaign_evidence")
    op.drop_table("campaign_accounts")
    op.drop_table("campaigns")
