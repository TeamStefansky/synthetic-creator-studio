"""End-to-end ingestion pipeline, offline, driven by FakeConnector against the DB.

Covers: watchlist matching -> document_matches rows, near-duplicate collapse
(dedup_of), batch-upsert idempotency (a second identical run inserts nothing),
and connector failure isolation (one poison connector never aborts the others).
"""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import RawDocument
from newsradar.connectors.fake import FakeConnector
from newsradar.db.models import Document, DocumentMatch, IngestionRun, Watchlist, WatchlistTerm
from newsradar.pipeline.runner import ingest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
_SINCE = dt.datetime(2026, 7, 1, tzinfo=dt.UTC)
_T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


def _wire(path: str) -> tuple[str, str]:
    raw = (FIXTURES / path).read_text().strip()
    lines = raw.splitlines()
    return lines[0], " ".join(lines[1:])


async def _reset(session: AsyncSession) -> None:
    """Isolate this test: the DB is shared across the session, so start clean."""

    await session.execute(
        text("TRUNCATE documents, document_matches, ingestion_runs, sources CASCADE")
    )
    await session.commit()


async def _make_watchlist(session: AsyncSession) -> Watchlist:
    wl = Watchlist(name=f"test-wl-{uuid.uuid4().hex}", lang_filter=None, country_filter=None)
    session.add(wl)
    await session.flush()
    session.add(
        WatchlistTerm(
            watchlist_id=wl.id, term="cybersecurity", term_type="keyword", lang=None, weight=1.0
        )
    )
    await session.commit()
    return wl


def _docs() -> list[RawDocument]:
    title_a, body_a = _wire("dedup_wire_a.txt")
    title_b, body_b = _wire("dedup_wire_b.txt")
    title_c, body_c = _wire("dedup_distinct.txt")
    return [
        RawDocument(
            source_domain="reuters.com",
            url="https://reuters.com/wire-a",
            title=title_a,
            body_text=body_a,
            published_at=_T0,
        ),
        RawDocument(
            source_domain="apnews.com",
            url="https://apnews.com/wire-b",
            title=title_b,
            body_text=body_b,
            published_at=_T0 + dt.timedelta(hours=1),
        ),
        RawDocument(
            source_domain="ynetnews.com",
            url="https://ynetnews.com/rail",
            title=title_c,
            body_text=body_c,
            published_at=_T0,
        ),
    ]


@pytest.mark.asyncio
async def test_full_pipeline_matches_and_dedup(session: AsyncSession) -> None:
    await _reset(session)
    wl = await _make_watchlist(session)
    connector = FakeConnector(documents=_docs(), name="fake")

    results = await ingest(str(wl.id), connectors=[connector], since=_SINCE)
    assert len(results) == 1
    run = results[0]
    assert run.fetched == 3
    assert run.inserted == 3
    assert run.duplicates == 1  # wire-b is a near-duplicate of wire-a
    assert run.errors == 0
    assert run.status == "ok"

    # Three documents, with wire-b pointing at wire-a as its canonical.
    total = (await session.execute(select(func.count()).select_from(Document))).scalar_one()
    assert total == 3
    a_id = (
        await session.execute(
            select(Document.id).where(Document.url == "https://reuters.com/wire-a")
        )
    ).scalar_one()
    b_dedup = (
        await session.execute(
            select(Document.dedup_of).where(Document.url == "https://apnews.com/wire-b")
        )
    ).scalar_one()
    assert b_dedup == a_id

    # Only the two cybersecurity stories are linked to the watchlist.
    match_count = (
        await session.execute(
            select(func.count())
            .select_from(DocumentMatch)
            .where(DocumentMatch.watchlist_id == wl.id)
        )
    ).scalar_one()
    assert match_count == 2

    # A bookkeeping row was written.
    ingestion = (
        (await session.execute(select(IngestionRun).where(IngestionRun.watchlist_id == wl.id)))
        .scalars()
        .all()
    )
    assert len(ingestion) == 1
    assert ingestion[0].inserted == 3


@pytest.mark.asyncio
async def test_second_run_is_idempotent(session: AsyncSession) -> None:
    await _reset(session)
    wl = await _make_watchlist(session)
    docs = _docs()

    first = (await ingest(str(wl.id), connectors=[FakeConnector(docs, name="fake")], since=_SINCE))[
        0
    ]
    assert first.inserted == 3

    second = (
        await ingest(str(wl.id), connectors=[FakeConnector(docs, name="fake")], since=_SINCE)
    )[0]
    assert second.inserted == 0
    assert second.duplicates > 0

    total = (await session.execute(select(func.count()).select_from(Document))).scalar_one()
    assert total == 3  # no new rows on the second run


@pytest.mark.asyncio
async def test_failing_connector_does_not_abort_others(session: AsyncSession) -> None:
    await _reset(session)
    wl = await _make_watchlist(session)
    title_c, body_c = _wire("dedup_distinct.txt")
    good_doc = RawDocument(
        source_domain="ynetnews.com",
        url="https://ynetnews.com/rail",
        title="A cybersecurity update from the rail authority",
        body_text=body_c,
        published_at=_T0,
    )
    connectors = [
        FakeConnector(raise_on_fetch=True, name="boom"),
        FakeConnector(documents=[good_doc], name="good"),
    ]

    results = await ingest(str(wl.id), connectors=connectors, since=_SINCE)
    by_name = {r.connector: r for r in results}
    assert by_name["boom"].status == "error"
    assert by_name["good"].status == "ok"
    assert by_name["good"].inserted == 1

    # The good connector's document is persisted despite the poison connector.
    total = (await session.execute(select(func.count()).select_from(Document))).scalar_one()
    assert total == 1

    # Both runs are recorded, one failed and one ok.
    statuses = set(
        (
            await session.execute(
                select(IngestionRun.status).where(IngestionRun.watchlist_id == wl.id)
            )
        )
        .scalars()
        .all()
    )
    assert statuses == {"ok", "error"}
