"""Core data entities for the ingestion layer.

Author and Post are the normalized units every connector produces. IngestRun and
DeadLetter give the pipeline observability + a forensic trail. All columns are
DB-agnostic (work on SQLite and Postgres). JSON is used for flexible/raw blobs.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Author(Base):
    __tablename__ = "authors"
    __table_args__ = (UniqueConstraint("source", "source_author_id", name="uq_author_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    source_author_id: Mapped[str] = mapped_column(String(128))
    handle: Mapped[str | None] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    followers: Mapped[int | None] = mapped_column(Integer)
    following: Mapped[int | None] = mapped_column(Integer)
    posts_count: Mapped[int | None] = mapped_column(Integer)
    bio: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(Text)
    # Filled by the Authenticity Engine (Stage 2). Nullable for now.
    authenticity_score: Mapped[float | None] = mapped_column(Float)
    raw: Mapped[dict | None] = mapped_column(JSON)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
    signals: Mapped[list["AuthorSignal"]] = relationship(cascade="all, delete-orphan")


class AuthorSignal(Base):
    """One authenticity signal's contribution for an author (stored so the UI
    can explain *why* an account looks inauthentic). score: 0-100 inauthenticity."""
    __tablename__ = "author_signals"
    __table_args__ = (UniqueConstraint("author_id", "name", name="uq_author_signal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), index=True)
    name: Mapped[str] = mapped_column(String(48))
    score: Mapped[float] = mapped_column(Float)          # 0-100, higher = more inauthentic
    confidence: Mapped[float] = mapped_column(Float)     # 0-1
    weight: Mapped[float] = mapped_column(Float)
    explanation: Mapped[str | None] = mapped_column(Text)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (
        # Idempotency: never store the same source item twice on re-fetch.
        UniqueConstraint("source", "source_post_id", name="uq_post_source_id"),
        # content_hash is intentionally NOT unique — identical text from DIFFERENT
        # authors is the coordinated-behavior signal we preserve for Stage 3.
        Index("ix_post_source_ts", "source", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    source_post_id: Mapped[str] = mapped_column(String(128), index=True)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    # The watched entity/keyword this post was pulled for (Brand Watch scoping).
    entity: Mapped[str | None] = mapped_column(String(255), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("authors.id"))
    text: Mapped[str] = mapped_column(Text)
    lang: Mapped[str | None] = mapped_column(String(8))
    url: Mapped[str | None] = mapped_column(Text)
    media: Mapped[list | None] = mapped_column(JSON)
    engagement: Mapped[dict | None] = mapped_column(JSON)
    timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # Enrichment fields (Stage 4) — nullable for now.
    sentiment: Mapped[float | None] = mapped_column(Float)
    narrative_id: Mapped[int | None] = mapped_column(Integer, index=True)
    raw: Mapped[dict | None] = mapped_column(JSON)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    author: Mapped[Author | None] = relationship(back_populates="posts")


class Narrative(Base):
    """A cluster of posts pushing the same storyline. Manipulation Index = share
    of the narrative driven by low-authenticity accounts."""
    __tablename__ = "narratives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    keywords: Mapped[list | None] = mapped_column(JSON)
    post_count: Mapped[int] = mapped_column(Integer, default=0)
    account_count: Mapped[int] = mapped_column(Integer, default=0)
    sentiment_avg: Mapped[float | None] = mapped_column(Float)
    manipulation_index: Mapped[float | None] = mapped_column(Float)  # 0-100
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Campaign(Base):
    """A detected coordinated cluster: >=2 distinct accounts posting the same
    content within a tight time window. Evidence (the posts) is saved for the
    forensic report."""
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    sample_text: Mapped[str] = mapped_column(Text)
    coordination_score: Mapped[float] = mapped_column(Float)  # 0-100
    account_count: Mapped[int] = mapped_column(Integer)
    post_count: Mapped[int] = mapped_column(Integer)
    time_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    time_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sources: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    accounts: Mapped[list["CampaignAccount"]] = relationship(cascade="all, delete-orphan")
    evidence: Mapped[list["CampaignEvidence"]] = relationship(cascade="all, delete-orphan")


class CampaignAccount(Base):
    __tablename__ = "campaign_accounts"
    __table_args__ = (UniqueConstraint("campaign_id", "author_id", name="uq_campaign_account"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), index=True)


class CampaignEvidence(Base):
    __tablename__ = "campaign_evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id"))


class CoordinationEdge(Base):
    """Undirected co-posting relationship between two accounts (canonical a<b)."""
    __tablename__ = "coordination_edges"
    __table_args__ = (UniqueConstraint("author_a", "author_b", name="uq_coordination_edge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_a: Mapped[int] = mapped_column(ForeignKey("authors.id"), index=True)
    author_b: Mapped[int] = mapped_column(ForeignKey("authors.id"), index=True)
    weight: Mapped[int] = mapped_column(Integer, default=1)  # shared campaigns


class AlertRule(Base):
    """User-defined alert condition. type ∈ {new_campaign, high_manipulation,
    volume_spike, entity_mention}. channel ∈ {inapp, webhook, email}."""
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(32))
    threshold: Mapped[float] = mapped_column(Float, default=0)
    channel: Mapped[str] = mapped_column(String(16), default="inapp")
    config: Mapped[dict | None] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (UniqueConstraint("dedup_key", name="uq_alert_dedup"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("alert_rules.id"))
    rule_name: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    dedup_key: Mapped[str] = mapped_column(String(128), index=True)
    delivered: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class WatchedEntity(Base):
    """A brand/client/product/keyword monitored 24/7 by Brand Watch."""
    __tablename__ = "watched_entities"
    __table_args__ = (UniqueConstraint("name", name="uq_watched_entity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    query: Mapped[str | None] = mapped_column(String(255))  # search query; defaults to name
    enabled: Mapped[bool] = mapped_column(default=True)
    last_score: Mapped[float | None] = mapped_column(Float)
    last_status: Mapped[str | None] = mapped_column(String(16))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ThreatSnapshot(Base):
    """One Brand Watch threat-score reading, kept for baseline + history/trend."""
    __tablename__ = "threat_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(255), index=True)
    score: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16))
    total_posts: Mapped[int] = mapped_column(Integer, default=0)
    total_accounts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class IngestRun(Base):
    __tablename__ = "ingest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|ok|failed
    detail: Mapped[str | None] = mapped_column(Text)


class DeadLetter(Base):
    """Items that failed normalization/storage — kept for retry + forensics."""
    __tablename__ = "dead_letters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    reason: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
