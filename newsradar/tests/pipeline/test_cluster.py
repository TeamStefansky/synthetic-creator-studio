"""Incremental clustering unit tests: assignment, time gap, decay, status, merge."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Event, EventDocument, EventStatus
from newsradar.pipeline.cluster import (
    advance_statuses,
    cluster_watchlist,
    merge_close_events,
    recluster_watchlist,
)
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from tests.pipeline import _factories as f

_SUMMIT = " ".join(["summit trade tariffs negotiation delegation communique"] * 3)
_QUAKE = " ".join(["earthquake magnitude aftershock rescue rubble seismic"] * 3)
BASE = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


@pytest.mark.asyncio
async def test_similar_docs_cluster_together_distinct_topics_split(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    src = await f.make_source(session, "reuters.com")
    for i in range(3):
        d = await f.make_document(
            session,
            src,
            title=f"summit {i}",
            body=_SUMMIT + f" u{i}",
            published_at=BASE + dt.timedelta(hours=i),
        )
        await f.add_match(session, d, wl, ["summit"])
    for i in range(2):
        d = await f.make_document(
            session,
            src,
            title=f"quake {i}",
            body=_QUAKE + f" q{i}",
            published_at=BASE + dt.timedelta(hours=i),
        )
        await f.add_match(session, d, wl, ["earthquake"])
    await session.commit()

    await embed_documents(session, HashingEmbedder())
    await cluster_watchlist(session, watchlist_id=wl.id)

    events = list((await session.execute(select(Event))).scalars().all())
    assert len(events) == 2
    counts = sorted(e.doc_count for e in events)
    assert counts == [2, 3]


@pytest.mark.asyncio
async def test_time_gap_beyond_48h_starts_new_event(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    src = await f.make_source(session, "reuters.com")
    d1 = await f.make_document(session, src, title="summit a", body=_SUMMIT, published_at=BASE)
    # Same topic (cosine ~1) but 50h later — within the 72h candidate window yet
    # beyond the 48h assignment gap, so it must seed a new event.
    d2 = await f.make_document(
        session, src, title="summit b", body=_SUMMIT, published_at=BASE + dt.timedelta(hours=50)
    )
    for d in (d1, d2):
        await f.add_match(session, d, wl, ["summit"])
    await session.commit()

    await embed_documents(session, HashingEmbedder())
    await cluster_watchlist(session, watchlist_id=wl.id)
    assert (await session.execute(select(func.count()).select_from(Event))).scalar_one() == 2


@pytest.mark.asyncio
async def test_status_transitions(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    # Five distinct sources → source_count 5 → emerging becomes active.
    for i in range(5):
        src = await f.make_source(session, f"src{i}.com")
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
    event = (await session.execute(select(Event))).scalar_one()
    assert event.source_count == 5
    assert event.status == EventStatus.active

    last_seen = event.last_seen_at
    assert last_seen is not None
    await advance_statuses(session, watchlist_id=wl.id, now=last_seen + dt.timedelta(hours=13))
    await session.refresh(event)
    assert event.status == EventStatus.decaying

    await advance_statuses(session, watchlist_id=wl.id, now=last_seen + dt.timedelta(hours=73))
    await session.refresh(event)
    assert event.status == EventStatus.closed


@pytest.mark.asyncio
async def test_merge_close_events(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    src = await f.make_source(session, "reuters.com")
    emb = HashingEmbedder().embed_passages([_SUMMIT])[0]

    e1 = Event(
        watchlist_id=wl.id,
        centroid=emb,
        status=EventStatus.active,
        first_seen_at=BASE,
        last_seen_at=BASE + dt.timedelta(hours=2),
        doc_count=1,
        source_count=1,
    )
    e2 = Event(
        watchlist_id=wl.id,
        centroid=emb,
        status=EventStatus.active,
        first_seen_at=BASE + dt.timedelta(hours=1),
        last_seen_at=BASE + dt.timedelta(hours=3),
        doc_count=1,
        source_count=1,
    )
    session.add_all([e1, e2])
    await session.flush()
    da = await f.make_document(session, src, title="a", body=_SUMMIT)
    db = await f.make_document(session, src, title="b", body=_SUMMIT)
    session.add(EventDocument(event_id=e1.id, document_id=da.id, similarity=1.0, added_at=BASE))
    session.add(EventDocument(event_id=e2.id, document_id=db.id, similarity=1.0, added_at=BASE))
    await session.commit()

    merged = await merge_close_events(session, watchlist_id=wl.id, cosine_threshold=0.9)
    assert merged == 1
    survivor = (await session.execute(select(Event))).scalar_one()
    assert survivor.doc_count == 2

    # recluster runs (HDBSCAN over recent embeddings) and is a no-op merge here.
    assert await recluster_watchlist(session, watchlist_id=wl.id) == 0
