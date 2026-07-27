"""Pydantic response models shared by the P3 API routers."""

from __future__ import annotations

import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
