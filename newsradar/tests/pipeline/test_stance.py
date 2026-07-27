"""Stance tests, including the key domain gate: stance != document sentiment.

The disaster/favorable-entity case is asserted against a recorded fixture
response (``tests/fixtures/stance_disaster.json``) replayed through the fake LLM.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import DocumentEnrichment, StanceAssessment, WatchlistEntity
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import StanceBatchOut
from newsradar.pipeline.stance import assess_stance, entity_appears
from tests.pipeline import _factories as f

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_entity_appears() -> None:
    ent = WatchlistEntity(name="City Hall", entity_type="org", aliases=["municipality"])
    assert entity_appears("City Hall evacuated residents", ent) is True
    assert entity_appears("the municipality responded", ent) is True
    assert entity_appears("a wildfire spread", ent) is False


def _recorded_responder(purpose: str, user: str, model: type) -> StanceBatchOut:
    data = json.loads((FIXTURES / "stance_disaster.json").read_text())
    return StanceBatchOut.model_validate(data)


@pytest.mark.asyncio
async def test_stance_is_distinct_from_document_sentiment(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "citynews.com")
    wl = await f.make_watchlist(session)
    entity = await f.add_entity(session, wl, "City Hall", entity_type="org", is_primary=True)

    # A disaster story (negative EVENTS) that is FAVORABLE toward the entity.
    body = (
        "A deadly wildfire tore through the hills overnight, destroying dozens of homes. "
        "City Hall's emergency teams evacuated thousands within hours, and residents "
        "praised the rapid, well-organized response that City Hall's emergency teams mounted."
    )
    doc = await f.make_document(session, src, title="Wildfire hits the hills", body=body)
    await f.add_match(session, doc, wl, ["wildfire"])
    # Document-level sentiment is NEGATIVE (the events are catastrophic).
    session.add(DocumentEnrichment(document_id=doc.id, sentiment_overall=-0.7, enriched_at=f.T0))
    await session.commit()

    llm = FakeLLMClient(_recorded_responder)
    written = await assess_stance(session, llm, watchlist_id=wl.id)
    assert written == 1

    stance = (
        await session.execute(
            select(StanceAssessment).where(StanceAssessment.document_id == doc.id)
        )
    ).scalar_one()
    doc_sentiment = (
        await session.execute(
            select(DocumentEnrichment.sentiment_overall).where(
                DocumentEnrichment.document_id == doc.id
            )
        )
    ).scalar_one()

    # THE GATE: entity-targeted stance is favorable (+1) even though the document's
    # overall sentiment is negative — they are computed independently and differ.
    assert stance.stance == 1
    assert doc_sentiment < 0
    assert (stance.stance > 0) != (doc_sentiment > 0)
    assert stance.entity_id == entity.id
    assert "praised" in (stance.evidence_span or "")

    # Idempotent: the pair already exists, so a second pass writes nothing.
    assert await assess_stance(session, llm, watchlist_id=wl.id) == 0


@pytest.mark.asyncio
async def test_no_stance_when_entity_absent(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "citynews.com")
    wl = await f.make_watchlist(session)
    await f.add_entity(session, wl, "Senator Vance", entity_type="person")
    doc = await f.make_document(session, src, title="Weather today", body="Sunny and warm.")
    await f.add_match(session, doc, wl, ["weather"])
    await session.commit()

    llm = FakeLLMClient(_recorded_responder)
    assert await assess_stance(session, llm, watchlist_id=wl.id) == 0
