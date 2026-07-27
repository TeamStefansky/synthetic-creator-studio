"""Clustering quality gate: 60 documents across 4 known events.

Asserts the incremental clusterer produces <= 4 events with >= 0.90 purity on a
labeled fixture set built from four disjoint vocabularies. This gate must not be
weakened to pass — if it fails, fix the algorithm.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Event, EventDocument
from newsradar.pipeline.cluster import cluster_watchlist
from newsradar.pipeline.embed import HashingEmbedder, embed_documents
from tests.pipeline import _factories as f

# Four disjoint topic vocabularies — same-topic docs share tokens (high cosine),
# cross-topic docs share almost none (near-zero cosine).
_TOPICS: dict[str, list[str]] = {
    "summit": [
        "summit",
        "trade",
        "tariffs",
        "negotiation",
        "delegation",
        "communique",
        "ministers",
        "accord",
    ],
    "wildfire": [
        "wildfire",
        "evacuation",
        "flames",
        "firefighters",
        "hectares",
        "smoke",
        "blaze",
        "containment",
    ],
    "election": [
        "election",
        "ballots",
        "candidate",
        "turnout",
        "polling",
        "coalition",
        "parliament",
        "vote",
    ],
    "quake": [
        "earthquake",
        "magnitude",
        "aftershock",
        "rescue",
        "rubble",
        "seismic",
        "tremor",
        "collapse",
    ],
}
_SOURCES = [f"outlet{i}.com" for i in range(8)]


def _doc_text(topic_words: list[str], uniq: str) -> str:
    # Repeat shared topic tokens so within-topic cosine comfortably clears 0.82.
    return " ".join(topic_words * 3) + f" {uniq}a {uniq}b"


@pytest.mark.asyncio
async def test_cluster_purity_gate(session: AsyncSession) -> None:
    await f.reset(session)
    wl = await f.make_watchlist(session)
    sources = {}
    for dom in _SOURCES:
        sources[dom] = await f.make_source(session, dom)

    base = dt.datetime(2026, 7, 20, 0, 0, tzinfo=dt.UTC)
    labels: dict[object, str] = {}
    topics = list(_TOPICS.items())

    # 60 docs = 4 events x 15, interleaved so processing order mixes events.
    seq = 0
    for i in range(15):
        for topic, words in topics:
            uniq = f"{topic}{i}"
            src = sources[_SOURCES[seq % len(_SOURCES)]]
            doc = await f.make_document(
                session,
                src,
                title=f"{words[0]} update {i}",
                body=_doc_text(words, uniq),
                published_at=base + dt.timedelta(minutes=30 * seq),
            )
            await f.add_match(session, doc, wl, [words[0]])
            labels[doc.id] = topic
            seq += 1
    await session.commit()

    await embed_documents(session, HashingEmbedder())
    await cluster_watchlist(session, watchlist_id=wl.id)

    events = list(
        (await session.execute(select(Event).where(Event.watchlist_id == wl.id))).scalars().all()
    )
    links = (
        await session.execute(
            select(EventDocument.event_id, EventDocument.document_id).where(
                EventDocument.event_id.in_([e.id for e in events])
            )
        )
    ).all()

    # Purity = sum over predicted events of (majority true-label count) / total docs.
    by_event: dict[object, list[str]] = {}
    for event_id, doc_id in links:
        by_event.setdefault(event_id, []).append(labels[doc_id])

    total = sum(len(v) for v in by_event.values())
    correct = sum(max(v.count(lbl) for lbl in set(v)) for v in by_event.values())
    purity = correct / total

    assert total == 60, "every document must be clustered exactly once"
    assert len(by_event) <= 4, f"expected <= 4 predicted clusters, got {len(by_event)}"
    assert purity >= 0.90, f"cluster purity {purity:.3f} below the 0.90 gate"

    # Each event's doc_count / source_count are populated and self-consistent.
    for event in events:
        assert event.doc_count == len(by_event[event.id])
        assert 1 <= event.source_count <= len(_SOURCES)
