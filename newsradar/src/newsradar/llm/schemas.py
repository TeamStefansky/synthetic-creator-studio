"""Pydantic output contracts for every structured LLM call.

Every LLM call in NewsRadar returns one of these schemas via tool-use / structured
output. Nothing downstream ever regexes a free-text model response.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EntityKind = Literal["person", "org", "place", "product"]


class EntityOut(BaseModel):
    """A named entity with character offsets into the classified text."""

    model_config = ConfigDict(extra="ignore")

    text: str
    entity_type: EntityKind
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class DocumentEnrichmentOut(BaseModel):
    """Per-document cheap-tier enrichment produced by the Haiku classifier."""

    model_config = ConfigDict(extra="ignore")

    doc_index: int = Field(ge=0, description="Index of the document within the batch.")
    language: str | None = None
    entities: list[EntityOut] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    sentiment_overall: float = Field(ge=-1.0, le=1.0)


class EnrichmentBatchOut(BaseModel):
    """The batch envelope returned by one entity/sentiment Haiku call."""

    model_config = ConfigDict(extra="ignore")

    documents: list[DocumentEnrichmentOut] = Field(default_factory=list)


class StanceOut(BaseModel):
    """Entity-targeted stance for one (document, entity) pair.

    ``stance`` is the posture of the text *toward the named entity*, NOT the
    emotional valence of the events described.
    """

    model_config = ConfigDict(extra="ignore")

    pair_index: int = Field(ge=0, description="Index of the pair within the batch.")
    stance: int = Field(
        ge=-2,
        le=2,
        description="-2 hostile, -1 critical, 0 neutral, +1 favorable, +2 laudatory.",
    )
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_span: str = Field(max_length=200, description="Verbatim span from the document.")
    framing: str = Field(description="<=10 words describing the frame.")


class StanceBatchOut(BaseModel):
    """The batch envelope returned by one stance Haiku call."""

    model_config = ConfigDict(extra="ignore")

    assessments: list[StanceOut] = Field(default_factory=list)


class EventSummaryOut(BaseModel):
    """Sonnet-written event title and summary."""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(max_length=90)
    summary: str = Field(description="3-5 sentences.")


class ReportOut(BaseModel):
    """Sonnet-written analyst report body (Hebrew Markdown)."""

    model_config = ConfigDict(extra="ignore")

    markdown: str = Field(description="The full report in Hebrew Markdown.")
