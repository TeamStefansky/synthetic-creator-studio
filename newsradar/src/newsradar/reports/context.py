"""The ``ReportContext`` — the complete, LLM-free structured input to a report.

Every number a report can state must originate here (the renderer is given only
this context as JSON, never raw article text), so the audit that checks "every
figure in the markdown exists in the context" has a single source of truth. These
models therefore carry ids, titles, evidence *spans*, links and metrics — but
never a document ``body``.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Trajectory = Literal["rising", "falling", "steady"]


class EventBrief(BaseModel):
    """One event's headline metrics for the report."""

    model_config = ConfigDict(extra="forbid")

    event_id: uuid.UUID
    title: str | None
    status: str
    heat_score: float
    prev_heat_score: float | None
    trajectory: Trajectory
    doc_count: int
    source_count: int
    velocity: float | None
    acceleration: float | None
    source_diversity: float | None
    negativity_index: float | None
    country_codes: list[str] = Field(default_factory=list)
    first_seen_at: dt.datetime | None
    last_seen_at: dt.datetime | None


class TrendBrief(BaseModel):
    """A surging term/entity."""

    model_config = ConfigDict(extra="forbid")

    term: str
    term_kind: str
    lift: float
    current_share: float
    baseline_share: float
    doc_count: int
    source_count: int
    representative_event_ids: list[uuid.UUID] = Field(default_factory=list)
    first_detected_at: dt.datetime | None = None


class EvidenceItem(BaseModel):
    """A single negative-coverage citation: span + link, never a body."""

    model_config = ConfigDict(extra="forbid")

    document_id: uuid.UUID
    source_name: str
    tier: int | None
    url: str
    title: str | None
    published_at: dt.datetime | None
    stance: int
    confidence: float | None
    evidence_span: str | None
    framing: str | None
    is_opinion: bool


class EntityNegativeCoverage(BaseModel):
    """Negative coverage of one monitored entity, with evidence."""

    model_config = ConfigDict(extra="forbid")

    entity_id: uuid.UUID
    entity_name: str
    is_primary: bool
    negativity_index: float
    negative_doc_count: int
    negative_reach_share: float
    opinion_negative_doc_count: int
    evidence: list[EvidenceItem] = Field(default_factory=list)


class HotZoneBrief(BaseModel):
    """A geographic hot zone."""

    model_config = ConfigDict(extra="forbid")

    h3: str
    country_code: str | None
    lat: float
    lon: float
    doc_count: int
    z: float
    top_event_ids: list[uuid.UUID] = Field(default_factory=list)


class CountryCount(BaseModel):
    model_config = ConfigDict(extra="forbid")

    country_code: str
    doc_count: int


class SourceBreakdownItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_name: str
    tier: int | None
    doc_count: int


class VolumeStats(BaseModel):
    """Current-period volume versus the previous equal-length period."""

    model_config = ConfigDict(extra="forbid")

    current_docs: int
    previous_docs: int
    change_pct: float | None


class NoiseStats(BaseModel):
    """Ingestion noise: how much duplication was collapsed."""

    model_config = ConfigDict(extra="forbid")

    documents_ingested: int
    duplicates_collapsed: int
    unique_documents: int


class ReportContext(BaseModel):
    """The full structured context handed to the report renderer."""

    model_config = ConfigDict(extra="forbid")

    watchlist_id: uuid.UUID
    watchlist_name: str
    generated_at: dt.datetime
    period_start: dt.datetime
    period_end: dt.datetime
    lookback_hours: int
    sections: list[str]

    top_events: list[EventBrief] = Field(default_factory=list)
    new_events: list[EventBrief] = Field(default_factory=list)
    trends: list[TrendBrief] = Field(default_factory=list)
    negative_coverage: list[EntityNegativeCoverage] = Field(default_factory=list)
    geo_hot_zones: list[HotZoneBrief] = Field(default_factory=list)
    country_breakdown: list[CountryCount] = Field(default_factory=list)
    source_breakdown: list[SourceBreakdownItem] = Field(default_factory=list)
    volume: VolumeStats
    noise: NoiseStats

    def numeric_values(self) -> set[float]:
        """Every numeric figure in the context.

        Used by the hallucination audit: any number appearing in the rendered
        markdown must be present here (up to rounding / percent conversion).
        """

        from newsradar.reports.audit import collect_numbers

        return collect_numbers(self.model_dump(mode="json"))
