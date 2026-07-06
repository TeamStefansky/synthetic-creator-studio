"""Normalized schemas every connector emits, plus API response models."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NormalizedAuthor(BaseModel):
    source: str
    source_author_id: str
    handle: str | None = None
    display_name: str | None = None
    created_at: datetime | None = None
    followers: int | None = None
    following: int | None = None
    posts_count: int | None = None
    bio: str | None = None
    avatar_url: str | None = None
    raw: dict | None = None


class NormalizedPost(BaseModel):
    source: str
    source_post_id: str
    text: str
    lang: str | None = None
    url: str | None = None
    media: list = Field(default_factory=list)
    engagement: dict = Field(default_factory=dict)
    timestamp: datetime | None = None
    author: NormalizedAuthor | None = None
    raw: dict | None = None


class IngestResult(BaseModel):
    source: str
    fetched: int
    inserted: int
    duplicates: int
    errors: int
    status: str
    detail: str | None = None


# --- API read models --------------------------------------------------------

class AuthorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source: str
    handle: str | None
    display_name: str | None
    followers: int | None
    authenticity_score: float | None


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source: str
    source_post_id: str
    text: str
    lang: str | None
    url: str | None
    timestamp: datetime | None
    author_id: int | None


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    score: float
    confidence: float
    weight: float
    explanation: str | None


class AuthorDetailOut(AuthorOut):
    display_name: str | None = None
    bio: str | None = None
    following: int | None = None
    posts_count: int | None = None
    signals: list[SignalOut] = []


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    coordination_score: float
    sample_text: str
    account_count: int
    post_count: int
    time_start: datetime | None
    time_end: datetime | None
    sources: list | None
