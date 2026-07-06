"""alerts engine: rules + alerts

Revision ID: 0005_alerts
Revises: 0004_narratives
Create Date: 2026-07-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_alerts"
down_revision = "0004_narratives"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("threshold", sa.Float()),
        sa.Column("channel", sa.String(length=16)),
        sa.Column("config", sa.JSON()),
        sa.Column("enabled", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("alert_rules.id")),
        sa.Column("rule_name", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("dedup_key", sa.String(length=128), nullable=False),
        sa.Column("delivered", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("dedup_key", name="uq_alert_dedup"),
    )
    op.create_index("ix_alerts_dedup_key", "alerts", ["dedup_key"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("alert_rules")
