"""brand watch: entity tag on posts

Revision ID: 0006_post_entity
Revises: 0005_alerts
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_post_entity"
down_revision = "0005_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("entity", sa.String(length=255), nullable=True))
    op.create_index("ix_posts_entity", "posts", ["entity"])


def downgrade() -> None:
    op.drop_index("ix_posts_entity", table_name="posts")
    op.drop_column("posts", "entity")
