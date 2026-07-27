"""Pydantic response models shared by the P3 API routers."""

from __future__ import annotations

import datetime as dt
import re
import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

_CC_RE = re.compile(r"^[A-Za-z]{2}$")


def _validate_country_code(value: str) -> str:
    """Validate and normalise a single ISO 3166-1 alpha-2 country code."""

    if not _CC_RE.match(value):
        raise ValueError(f"invalid ISO 3166-1 alpha-2 country code: {value!r}")
    return value.upper()


CountryCode = Annotated[str, AfterValidator(_validate_country_code)]


class Page[T](BaseModel):
    """A paginated list response."""

    items: list[T]
    total: int
    limit: int
    offset: int


class WatchlistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    active: bool


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    watchlist_id: uuid.UUID
    title: str | None
    status: str
    heat_score: float
    negativity_score: float
    doc_count: int
    source_count: int
    country_codes: list[str] = Field(default_factory=list)
    first_seen_at: dt.datetime | None
    last_seen_at: dt.datetime | None

    @field_validator("country_codes", mode="before")
    @classmethod
    def _none_to_empty(cls, v: object) -> object:
        return v if v is not None else []


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_name: str
    url: str
    title: str | None
    published_at: dt.datetime | None
    is_opinion: bool | None


class StanceOut(BaseModel):
    document_id: uuid.UUID
    entity_id: uuid.UUID
    entity_name: str
    stance: int
    confidence: float | None
    evidence_span: str | None
    framing: str | None


class EventDetailOut(EventOut):
    documents: list[DocumentOut] = Field(default_factory=list)
    stance: list[StanceOut] = Field(default_factory=list)


class TrendOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    term: str
    term_kind: str
    lift: float
    current_share: float
    baseline_share: float
    doc_count: int
    source_count: int
    representative_event_ids: list[uuid.UUID] = Field(default_factory=list)
    first_detected_at: dt.datetime | None


class HotZoneOut(BaseModel):
    h3: str
    country_code: str | None
    lat: float
    lon: float
    doc_count: int
    z: float
    top_event_ids: list[uuid.UUID] = Field(default_factory=list)


class CountryCountOut(BaseModel):
    country_code: str
    doc_count: int


class GeoOut(BaseModel):
    hot_zones: list[HotZoneOut] = Field(default_factory=list)
    country_breakdown: list[CountryCountOut] = Field(default_factory=list)


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    rule_name: str
    severity: str
    fired_at: dt.datetime | None
    delivered_at: dt.datetime | None
    delivery_error: str | None
    payload: dict[str, object] | None


class ReportSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    watchlist_id: uuid.UUID
    schedule_id: uuid.UUID | None
    period_start: dt.datetime | None
    period_end: dt.datetime | None
    generated_at: dt.datetime
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    event_ids: list[uuid.UUID] = Field(default_factory=list)
    has_pdf: bool = False


class ReportDetailOut(ReportSummaryOut):
    markdown: str | None
    html: str | None
    artifact_path: str | None


class GenerateReportIn(BaseModel):
    watchlist_id: uuid.UUID
    lookback_hours: int = Field(default=24, ge=1, le=720)
    sections: list[str] = Field(
        default_factory=lambda: ["overview", "hot_events", "trends", "negative_coverage", "geo"]
    )


class ReportScheduleIn(BaseModel):
    watchlist_id: uuid.UUID
    name: str
    cron: str
    timezone: str = "Asia/Jerusalem"
    sections: list[str] | None = None
    recipients: dict[str, object] | None = None
    format: str = "markdown"
    lookback_hours: int = Field(default=24, ge=1, le=720)
    active: bool = True


class ReportSchedulePatch(BaseModel):
    name: str | None = None
    cron: str | None = None
    timezone: str | None = None
    sections: list[str] | None = None
    recipients: dict[str, object] | None = None
    format: str | None = None
    lookback_hours: int | None = Field(default=None, ge=1, le=720)
    active: bool | None = None


class ReportScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    watchlist_id: uuid.UUID
    name: str
    cron: str
    timezone: str
    sections: list[str] | None
    recipients: dict[str, object] | None
    format: str
    lookback_hours: int
    active: bool
    last_run_at: dt.datetime | None


# --------------------------------------------------------------------------------------
# P5 — sources, feeds, batch import, API sources, interests
# --------------------------------------------------------------------------------------


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    domain: str
    source_type: str
    country_code: str | None
    lang: str | None
    tier: int
    credibility_score: float
    content_rights: str
    rights_note: str | None
    active: bool
    created_at: dt.datetime


class SourceCreateIn(BaseModel):
    name: str
    domain: str
    source_type: str = "news"
    country_code: CountryCode | None = None
    lang: str | None = None
    tier: int = Field(default=4, ge=1, le=4)


class SourcePatchIn(BaseModel):
    name: str | None = None
    country_code: CountryCode | None = None
    lang: str | None = None
    tier: int | None = Field(default=None, ge=1, le=4)
    active: bool | None = None


class RightsPatchIn(BaseModel):
    """Manual rights change. Upgrading to ``full_ok`` requires a ``rights_note``."""

    content_rights: str = Field(pattern="^(link_only|extract_ok|full_ok)$")
    rights_note: str | None = None


class FeedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    feed_url: str
    title: str | None
    tags: list[str] | None
    country_code: str | None
    lang: str | None
    poll_interval_seconds: int
    active: bool
    last_polled_at: dt.datetime | None
    last_ok_at: dt.datetime | None
    consecutive_failures: int
    created_at: dt.datetime


class FeedCreateIn(BaseModel):
    feed_url: str
    title: str | None = None
    tags: list[str] | None = None
    country_code: CountryCode | None = None
    lang: str | None = None
    poll_interval_seconds: int = Field(default=600, ge=60, le=86400)


class FeedPatchIn(BaseModel):
    title: str | None = None
    tags: list[str] | None = None
    country_code: CountryCode | None = None
    lang: str | None = None
    poll_interval_seconds: int | None = Field(default=None, ge=60, le=86400)
    active: bool | None = None


class DiscoverIn(BaseModel):
    url: str


class DiscoveredFeedOut(BaseModel):
    feed_url: str
    title: str | None
    site_title: str | None
    item_count: int
    last_published_at: dt.datetime | None
    detected_lang: str | None
    detected_country: str | None


class BatchIn(BaseModel):
    """Pasted site URLs (newline- or comma-separated). Feed discovery is the system's job."""

    text: str


class BatchResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    input_line: str
    normalized_url: str | None
    status: str
    feed_url: str | None
    title: str | None
    error: str | None


class BatchJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    total: int
    processed: int
    created_at: dt.datetime
    finished_at: dt.datetime | None


class BatchJobDetailOut(BatchJobOut):
    results: list[BatchResultOut] = Field(default_factory=list)


class OpmlImportOut(BaseModel):
    imported: int
    duplicates: int
    feeds: list[FeedOut] = Field(default_factory=list)


class FeedHealthOut(BaseModel):
    feed_url: str
    active: bool
    consecutive_failures: int
    last_ok_at: dt.datetime | None
    last_polled_at: dt.datetime | None
    deactivated_reason: str | None


class ApiSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    provider: str
    name: str
    enabled: bool
    country_filter: list[str] | None
    lang_filter: list[str] | None
    extra_params: dict[str, object] | None
    created_at: dt.datetime


class ApiSourceCreateIn(BaseModel):
    provider: str = Field(pattern="^(gdelt|perigon)$")
    name: str
    enabled: bool = True
    country_filter: list[CountryCode] | None = None
    lang_filter: list[str] | None = None
    extra_params: dict[str, object] | None = None


class ApiSourcePatchIn(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    country_filter: list[CountryCode] | None = None
    lang_filter: list[str] | None = None
    extra_params: dict[str, object] | None = None


class InterestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    keywords: list[str] = Field(default_factory=list)
    source_country_filter: list[str] | None
    subject_country_filter: list[str] | None
    country_match_mode: str
    lang_filter: list[str] | None
    min_semantic_similarity: float
    active: bool
    has_embedding: bool = False


class InterestCreateIn(BaseModel):
    name: str
    description: str = ""
    keywords: list[str] = Field(default_factory=list)
    # source_countries = where the outlet is based (sources.country_code).
    source_countries: list[CountryCode] | None = None
    # subject_countries = what the story is about (document_enrichment.geo.country_code).
    subject_countries: list[CountryCode] | None = None
    country_match_mode: str = Field(default="either", pattern="^(source|subject|either)$")
    lang_filter: list[str] | None = None
    min_semantic_similarity: float = Field(default=0.78, ge=0.0, le=1.0)


class InterestPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    source_countries: list[CountryCode] | None = None
    subject_countries: list[CountryCode] | None = None
    country_match_mode: str | None = Field(default=None, pattern="^(source|subject|either)$")
    lang_filter: list[str] | None = None
    min_semantic_similarity: float | None = Field(default=None, ge=0.0, le=1.0)
    active: bool | None = None


class InterestPreviewItemOut(BaseModel):
    document_id: uuid.UUID
    source_name: str
    url: str
    title: str | None
    published_at: dt.datetime | None
    matched_terms: list[str]
    match_score: float
    source_country: str | None
    subject_country: str | None
    image_url: str | None
