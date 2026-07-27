"""Enrichment tests: prominence, is_opinion, and the batched Haiku tier (fake LLM)."""

from __future__ import annotations

import re

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import DocumentEnrichment
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import DocumentEnrichmentOut, EnrichmentBatchOut, EntityOut
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from newsradar.pipeline.enrich import (
    compute_prominence,
    detect_is_opinion,
    enrich_documents,
)
from newsradar.pipeline.geonames import GeoNamesResolver
from tests.pipeline import _factories as f


def test_prominence_positions() -> None:
    body = "First paragraph mentions summit.\n\nLater paragraph mentions Geneva twice."
    assert compute_prominence(["Netanyahu"], "Netanyahu at summit", body) == 1.0
    assert compute_prominence(["summit"], "Weather report", body) == 0.7
    # A term only in the tail third of a longer body → 0.15.
    long_body = "x " * 200 + "\n\n" + "y " * 200 + "tailtoken " + "z " * 200
    assert compute_prominence(["tailtoken"], "Headline", long_body) == 0.15
    assert compute_prominence(["absent"], "Headline", body) == 0.0
    assert compute_prominence([], "Headline", body) is None


def test_is_opinion() -> None:
    assert detect_is_opinion("https://x.com/opinion/foo", "A take") is True
    assert detect_is_opinion("https://x.com/world/foo", "Opinion: why we must act") is True
    assert detect_is_opinion("https://x.com/world/foo", "News report", section="Editorial") is True
    assert detect_is_opinion("https://x.com/world/foo", "Straight news") is False


def _enrichment_responder(purpose: str, user: str, model: type) -> EnrichmentBatchOut:
    # One result per doc_index present in the prompt; include a place entity so
    # geo resolves against the bundled extract.
    indices = [int(m) for m in re.findall(r"doc_index=(\d+)", user)]
    return EnrichmentBatchOut(
        documents=[
            DocumentEnrichmentOut(
                doc_index=i,
                language="en",
                entities=[EntityOut(text="Geneva", entity_type="place", start=0, end=6)],
                topics=["diplomacy"],
                sentiment_overall=-0.3,
            )
            for i in indices
        ]
    )


@pytest.mark.asyncio
async def test_enrich_documents_writes_all_fields(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "reuters.com")
    wl = await f.make_watchlist(session)
    doc = await f.make_document(
        session,
        src,
        title="Summit opens in Geneva",
        body="Leaders gathered for a summit in Geneva to discuss the crisis.",
        url="https://reuters.com/world/summit",
    )
    await f.add_match(session, doc, wl, ["summit"])
    # A duplicate is embedded but must NOT be enriched.
    dup = await f.make_document(session, src, title="Wire copy", dedup_of=doc.id)
    await session.commit()

    embedder = HashingEmbedder()
    await embed_documents(session, embedder)  # embeds both, incl. the duplicate

    llm = FakeLLMClient(_enrichment_responder)
    geo = GeoNamesResolver()
    n = await enrich_documents(session, llm, geo, watchlist_id=wl.id)
    assert n == 1  # only the non-duplicate

    enr = (
        await session.execute(
            select(DocumentEnrichment).where(DocumentEnrichment.document_id == doc.id)
        )
    ).scalar_one()
    assert enr.embedding is not None  # embedding preserved by the enrich upsert
    assert enr.sentiment_overall == pytest.approx(-0.3)
    assert enr.prominence == 1.0  # "summit" is in the title
    assert enr.is_opinion is False
    assert enr.topics == ["diplomacy"]
    assert enr.geo is not None and enr.geo["country_code"] == "CH"
    assert enr.enriched_at is not None

    # The duplicate got an embedding but no enrichment.
    dup_enr = (
        await session.execute(
            select(DocumentEnrichment).where(DocumentEnrichment.document_id == dup.id)
        )
    ).scalar_one()
    assert dup_enr.embedding is not None
    assert dup_enr.enriched_at is None

    # Idempotent: a second pass enriches nothing new.
    assert await enrich_documents(session, llm, geo, watchlist_id=wl.id) == 0
