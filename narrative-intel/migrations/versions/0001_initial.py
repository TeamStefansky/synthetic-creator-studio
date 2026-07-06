"""initial ingestion schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-06

Reversible: upgrade creates authors/posts/ingest_runs/dead_letters; downgrade
drops them. Runs clean on an empty DB.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "authors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_author_id", sa.String(length=128), nullable=False),
        sa.Column("handle", sa.String(length=255)),
        sa.Column("display_name", sa.String(length=255)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("followers", sa.Integer()),
        sa.Column("following", sa.Integer()),
        sa.Column("posts_count", sa.Integer()),
        sa.Column("bio", sa.Text()),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("authenticity_score", sa.Float()),
        sa.Column("raw", sa.JSON()),
        sa.Column("first_seen", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("source", "source_author_id", name="uq_author_source"),
    )
    op.create_index("ix_authors_source", "authors", ["source"])

    op.create_table(
        "posts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_post_id", sa.String(length=128), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("authors.id")),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("lang", sa.String(length=8)),
        sa.Column("url", sa.Text()),
        sa.Column("media", sa.JSON()),
        sa.Column("engagement", sa.JSON()),
        sa.Column("timestamp", sa.DateTime(timezone=True)),
        sa.Column("sentiment", sa.Float()),
        sa.Column("narrative_id", sa.Integer()),
        sa.Column("raw", sa.JSON()),
        sa.Column("ingested_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("source", "source_post_id", name="uq_post_source_id"),
    )
    op.create_index("ix_posts_source", "posts", ["source"])
    op.create_index("ix_posts_source_post_id", "posts", ["source_post_id"])
    op.create_index("ix_posts_content_hash", "posts", ["content_hash"])
    op.create_index("ix_posts_timestamp", "posts", ["timestamp"])
    op.create_index("ix_posts_narrative_id", "posts", ["narrative_id"])
    op.create_index("ix_post_source_ts", "posts", ["source", "timestamp"])

    op.create_table(
        "ingest_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("fetched", sa.Integer()),
        sa.Column("inserted", sa.Integer()),
        sa.Column("duplicates", sa.Integer()),
        sa.Column("errors", sa.Integer()),
        sa.Column("status", sa.String(length=16)),
        sa.Column("detail", sa.Text()),
    )
    op.create_index("ix_ingest_runs_source", "ingest_runs", ["source"])

    op.create_table(
        "dead_letters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_dead_letters_source", "dead_letters", ["source"])


def downgrade() -> None:
    op.drop_table("dead_letters")
    op.drop_table("ingest_runs")
    op.drop_table("posts")
    op.drop_table("authors")
