"""Event summarization tests (Sonnet tier) using the fake LLM."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Event, LlmCall
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import EventSummaryOut
from newsradar.pipeline.cluster import cluster_watchlist
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from newsradar.pipeline.summarize import summarize_events
from tests.pipeline import _factories as f

_SUMMIT = " ".join(["summit trade tariffs negotiation delegation communique"] * 3)
BASE = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


def _summary_responder(purpose: str, user: str, model: type) -> EventSummaryOut:
    return EventSummaryOut(
        title="Trade summit opens in Geneva",
        summary="Ministers convened. Talks focus on tariffs. Outcome pending.",
    )


async def _seed_event(session: AsyncSession, n_sources: int):
    wl = await f.make_watchlist(session, name=f"wl-{n_sources}")
    for i in range(n_sources):
        src = await f.make_source(session, f"o{i}.com", tier=(1 if i == 0 else 3))
        d = await f.make_document(
            session,
            src,
            title=f"summit {i}",
            body=_SUMMIT + f" u{i}",
            published_at=BASE + dt.timedelta(hours=i),
        )
        await f.add_match(session, d, wl, ["summit"])
    await session.commit()
    await embed_documents(session, HashingEmbedder())
    await cluster_watchlist(session, watchlist_id=wl.id)
    return wl


@pytest.mark.asyncio
async def test_summarizes_eligible_event(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await _seed_event(session, n_sources=4)  # source_count 4 >= 3

    llm = FakeLLMClient(_summary_responder)
    assert await summarize_events(session, llm, watchlist_id=wl.id) == 1

    event = (await session.execute(select(Event))).scalar_one()
    assert event.title == "Trade summit opens in Geneva"
    assert event.summary and event.summary.count(".") >= 3
    assert event.summary_model == "claude-sonnet-5"
    assert event.summary_doc_count == event.doc_count

    # Sonnet accounting recorded under the event_summary purpose.
    call = (await session.execute(select(LlmCall))).scalar_one()
    assert call.purpose == "event_summary"
    assert call.model == "claude-sonnet-5"

    # Idempotent: below the regeneration growth threshold, nothing regenerates.
    assert await summarize_events(session, llm, watchlist_id=wl.id) == 0


@pytest.mark.asyncio
async def test_below_source_threshold_not_summarized(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await _seed_event(session, n_sources=2)  # source_count 2 < 3
    llm = FakeLLMClient(_summary_responder)
    assert await summarize_events(session, llm, watchlist_id=wl.id) == 0
    event = (await session.execute(select(Event))).scalar_one()
    assert event.title is None


@pytest.mark.asyncio
async def test_regenerates_after_50pct_growth(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await _seed_event(session, n_sources=4)
    llm = FakeLLMClient(_summary_responder)
    assert await summarize_events(session, llm, watchlist_id=wl.id) == 1
    event = (await session.execute(select(Event))).scalar_one()
    assert event.summary_doc_count == 4

    # Grow the event past 1.5x (4 -> 6 docs) so a regeneration is triggered.
    src = await f.make_source(session, "extra.com", tier=2)
    for i in range(2):
        d = await f.make_document(
            session,
            src,
            title=f"summit extra {i}",
            body=_SUMMIT + f" x{i}",
            published_at=BASE + dt.timedelta(hours=10 + i),
        )
        await f.add_match(session, d, wl, ["summit"])
    await session.commit()
    await embed_documents(session, HashingEmbedder())
    await cluster_watchlist(session, watchlist_id=wl.id)

    await session.refresh(event)
    assert event.doc_count == 6
    assert await summarize_events(session, llm, watchlist_id=wl.id) == 1
    await session.refresh(event)
    assert event.summary_doc_count == 6
