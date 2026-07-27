"""Schema smoke test.

Inserts exactly one row into every one of the 14 tables against the migrated test
database, then asserts that the ``documents.url_hash`` UNIQUE constraint and the
``stance_assessments.stance`` CHECK constraint both raise ``IntegrityError``.
"""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    Alert,
    Document,
    DocumentEnrichment,
    DocumentMatch,
    Event,
    EventDocument,
    EventMetric,
    Report,
    ReportSchedule,
    Source,
    StanceAssessment,
    Watchlist,
    WatchlistEntity,
    WatchlistTerm,
)
from newsradar.db.session import get_sessionmaker

_NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


async def _insert_full_graph(session: AsyncSession) -> dict[str, object]:
    """Insert one row per table; return the ids/values the violation checks need.

    Each call uses unique natural keys so tests can share one migrated database
    without colliding on the ``domain``/``name``/``url_hash`` uniqueness rules.
    """

    suffix = uuid.uuid4().hex
    url_hash = uuid.uuid4().hex + uuid.uuid4().hex  # 64 hex chars

    source = Source(
        name=f"Test Wire {suffix}",
        domain=f"test-wire-{suffix}.example",
        source_type="news",
        country_code="IL",
        lang="en",
        tier=1,
        credibility_score=0.9,
    )
    watchlist = Watchlist(name=f"Test Watchlist {suffix}", description="smoke")
    session.add_all([source, watchlist])
    await session.flush()

    term = WatchlistTerm(watchlist_id=watchlist.id, term="cyber", term_type="keyword", lang="en")
    entity = WatchlistEntity(
        watchlist_id=watchlist.id,
        name="Test Person",
        entity_type="person",
        aliases=["TP"],
        is_primary=True,
    )
    session.add_all([term, entity])
    await session.flush()

    document = Document(
        source_id=source.id,
        url=f"https://test-wire-{suffix}.example/a",
        canonical_url=f"https://test-wire-{suffix}.example/a",
        url_hash=url_hash,
        simhash=1234567890,
        title="Title",
        lang="en",
        published_at=_NOW,
        fetched_at=_NOW,
        media_type="article",
    )
    session.add(document)
    await session.flush()

    match = DocumentMatch(
        document_id=document.id,
        watchlist_id=watchlist.id,
        matched_terms=["cyber"],
        match_score=0.8,
    )
    enrichment = DocumentEnrichment(
        document_id=document.id,
        entities=[{"text": "Test Person", "type": "person", "offset": 0, "confidence": 0.9}],
        topics=["security"],
        geo={
            "country_code": "IL",
            "admin1": "Tel Aviv",
            "lat": 32.0,
            "lon": 34.8,
            "confidence": 0.7,
        },
        sentiment_overall=-0.2,
        prominence=0.5,
        is_opinion=False,
        enriched_at=_NOW,
        model_version="v1",
    )
    stance = StanceAssessment(
        document_id=document.id,
        entity_id=entity.id,
        stance=-1,
        confidence=0.7,
        evidence_span="…",
        model="claude-haiku-4-5",
    )
    session.add_all([match, enrichment, stance])
    await session.flush()

    event = Event(
        watchlist_id=watchlist.id, title="Test Event", first_seen_at=_NOW, last_seen_at=_NOW
    )
    session.add(event)
    await session.flush()

    event_doc = EventDocument(
        event_id=event.id, document_id=document.id, similarity=0.9, added_at=_NOW
    )
    metric = EventMetric(
        event_id=event.id, bucket_at=_NOW, doc_count=1, velocity=1.0, heat_score=0.5
    )
    alert = Alert(
        event_id=event.id, rule_name="spike", severity="warning", fired_at=_NOW, payload={"n": 1}
    )
    session.add_all([event_doc, metric, alert])

    schedule = ReportSchedule(
        watchlist_id=watchlist.id,
        name="Daily",
        cron="0 7 * * *",
        sections=["overview", "hot_events"],
        recipients={"email": ["editor@example.com"]},
        format="markdown",
    )
    session.add(schedule)
    await session.flush()

    report = Report(
        watchlist_id=watchlist.id,
        schedule_id=schedule.id,
        period_start=_NOW,
        period_end=_NOW,
        markdown="# report",
        model="claude-sonnet-5",
        input_tokens=100,
        output_tokens=50,
        event_ids=[event.id],
    )
    session.add(report)
    await session.commit()

    return {
        "source_id": source.id,
        "document_id": document.id,
        "entity_id": entity.id,
        "url_hash": url_hash,
    }


@pytest.mark.asyncio
async def test_insert_one_row_per_table(session: AsyncSession) -> None:
    ids = await _insert_full_graph(session)
    assert ids["document_id"] is not None


@pytest.mark.asyncio
async def test_url_hash_unique_constraint_raises(session: AsyncSession) -> None:
    ids = await _insert_full_graph(session)

    factory = get_sessionmaker()
    async with factory() as s2:
        dup = Document(
            source_id=ids["source_id"],
            url="https://dup.example/b",
            canonical_url="https://dup.example/b",
            url_hash=ids["url_hash"],  # duplicate — violates uq_documents_url_hash
            media_type="article",
        )
        s2.add(dup)
        with pytest.raises(IntegrityError):
            await s2.flush()
        await s2.rollback()


@pytest.mark.asyncio
async def test_stance_check_constraint_raises(session: AsyncSession) -> None:
    ids = await _insert_full_graph(session)

    factory = get_sessionmaker()
    async with factory() as s2:
        bad = StanceAssessment(
            document_id=ids["document_id"],
            entity_id=ids["entity_id"],
            stance=5,  # out of [-2, 2] — violates ck_stance_range
            confidence=0.5,
        )
        s2.add(bad)
        with pytest.raises(IntegrityError):
            await s2.flush()
        await s2.rollback()
