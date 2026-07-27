"""End-to-end enrichment pipeline: embed -> enrich -> stance -> cluster -> summarize.

Uses the deterministic hashing embedder and a fake LLM that dispatches on the
call purpose, so the whole DAG runs offline against the real database.
"""

from __future__ import annotations

import datetime as dt
import re

import pytest
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import DocumentEnrichment, Event, StanceAssessment
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import (
    DocumentEnrichmentOut,
    EnrichmentBatchOut,
    EntityOut,
    EventSummaryOut,
    StanceBatchOut,
    StanceOut,
)
from newsradar.pipeline.embed import HashingEmbedder
from newsradar.pipeline.geonames import GeoNamesResolver
from newsradar.pipeline.run import run_pipeline
from tests.pipeline import _factories as f

_BODY = " ".join(["summit trade tariffs Geneva Prime Minister delegation communique"] * 3)
BASE = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


def _responder(purpose: str, user: str, model: type[BaseModel]) -> BaseModel:
    if purpose == "enrich_entities":
        indices = [int(m) for m in re.findall(r"doc_index=(\d+)", user)]
        return EnrichmentBatchOut(
            documents=[
                DocumentEnrichmentOut(
                    doc_index=i,
                    language="en",
                    entities=[
                        EntityOut(text="Geneva", entity_type="place", start=0, end=6),
                        EntityOut(text="Prime Minister", entity_type="person", start=0, end=14),
                    ],
                    topics=["diplomacy"],
                    sentiment_overall=-0.2,
                )
                for i in indices
            ]
        )
    if purpose == "stance":
        n = len(re.findall(r"pair_index=(\d+)", user))
        return StanceBatchOut(
            assessments=[
                StanceOut(
                    pair_index=i,
                    stance=1,
                    confidence=0.8,
                    evidence_span="the Prime Minister was praised for the deal",
                    framing="diplomatic win",
                )
                for i in range(n)
            ]
        )
    return EventSummaryOut(
        title="Trade summit convenes in Geneva",
        summary="Ministers met in Geneva. Tariffs dominated the talks. No accord yet.",
    )


@pytest.mark.asyncio
async def test_full_pipeline_produces_events(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session, name="demo")
    await f.add_entity(session, wl, "Prime Minister", entity_type="person", is_primary=True)

    # 6 documents about one summit across 4 distinct sources.
    srcs = [
        await f.make_source(session, f"outlet{j}.com", tier=(1 if j == 0 else 2)) for j in range(4)
    ]
    for i in range(6):
        src = srcs[i % 4]
        doc = await f.make_document(
            session,
            src,
            title=f"Summit day {i}",
            body=_BODY + f" u{i}",
            published_at=BASE + dt.timedelta(hours=i),
        )
        await f.add_match(session, doc, wl, ["summit"])
    await session.commit()

    result = await run_pipeline(
        wl.id,
        embedder=HashingEmbedder(),
        llm=FakeLLMClient(_responder),
        geo=GeoNamesResolver(),
        sessionmaker=None,
    )

    assert result.embedded == 6
    assert result.enriched == 6
    assert result.stance_pairs == 6  # one (doc, entity) pair per doc
    assert result.events_created == 1
    assert result.summaries == 1

    # One event, backed by multiple distinct sources, with a human-readable title.
    event = (await session.execute(select(Event).where(Event.watchlist_id == wl.id))).scalar_one()
    assert event.doc_count == 6
    assert event.source_count == 4
    assert event.title == "Trade summit convenes in Geneva"
    assert event.summary is not None

    # Enrichment + geo + stance all populated.
    enr_geo = (
        await session.execute(
            select(DocumentEnrichment.geo).where(DocumentEnrichment.geo.is_not(None))
        )
    ).first()
    assert enr_geo is not None and enr_geo[0]["country_code"] == "CH"
    stance_count = (
        await session.execute(select(func.count()).select_from(StanceAssessment))
    ).scalar_one()
    assert stance_count == 6

    # Re-running the pipeline is a no-op (everything already processed).
    again = await run_pipeline(
        wl.id, embedder=HashingEmbedder(), llm=FakeLLMClient(_responder), geo=GeoNamesResolver()
    )
    assert again.embedded == 0 and again.enriched == 0 and again.stance_pairs == 0
