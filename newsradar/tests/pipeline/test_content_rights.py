"""Content-rights licensing gate (P5).

For a ``link_only`` source, ingesting a full article stores ``body IS NULL`` and
``len(summary) <= 300``; for ``extract_ok``, ``body IS NULL`` and
``len(summary) <= 400``; for ``full_ok``, the full body is stored. Matching and
near-duplicate SimHash are unaffected — only what is persisted changes.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import RawDocument
from newsradar.connectors.fake import FakeConnector
from newsradar.db.models import Document, Source, Watchlist, WatchlistTerm
from newsradar.pipeline.normalize import (
    normalize_document,
    storage_for_rights,
)
from newsradar.pipeline.runner import ingest

_T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)
# A long body well over both the 300- and 400-char caps.
_LONG_BODY = (
    "A sweeping investigation into cross-border logistics revealed systemic "
    "delays across a dozen ports. " * 20
)


def test_storage_for_rights_caps_pure() -> None:
    raw = RawDocument(
        source_domain="example.com",
        url="https://example.com/a",
        title="Ports investigation",
        body_text=_LONG_BODY,
        published_at=_T0,
    )
    # full_ok is normalised with the body present; the capped tiers without it.
    full = normalize_document(raw, allows_fulltext_storage=True)
    gated = normalize_document(raw, allows_fulltext_storage=False)

    body, summary = storage_for_rights(full, "full_ok")
    assert body is not None and len(body) > 400

    body, summary = storage_for_rights(gated, "extract_ok")
    assert body is None
    assert summary is not None and len(summary) <= 400

    body, summary = storage_for_rights(gated, "link_only")
    assert body is None
    assert summary is not None and len(summary) <= 300


async def _reset(session: AsyncSession) -> None:
    await session.execute(
        text("TRUNCATE documents, document_matches, ingestion_runs, sources CASCADE")
    )
    await session.commit()


async def _watchlist(session: AsyncSession) -> Watchlist:
    wl = Watchlist(name=f"rights-{dt.datetime.now(dt.UTC).timestamp()}")
    session.add(wl)
    await session.flush()
    session.add(WatchlistTerm(watchlist_id=wl.id, term="logistics", term_type="keyword"))
    await session.commit()
    return wl


async def _make_source(session: AsyncSession, domain: str, content_rights: str) -> None:
    session.add(
        Source(
            name=domain,
            domain=domain,
            source_type="news",
            tier=2,
            credibility_score=0.6,
            allows_fulltext_storage=(content_rights == "full_ok"),
            content_rights=content_rights,
            active=True,
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_ingestion_enforces_rights_at_all_three_tiers(session: AsyncSession) -> None:
    await _reset(session)
    wl = await _watchlist(session)
    await _make_source(session, "linkonly.com", "link_only")
    await _make_source(session, "extract.com", "extract_ok")
    await _make_source(session, "full.com", "full_ok")

    docs = [
        RawDocument(
            source_domain=dom,
            url=f"https://{dom}/story",
            title="Cross-border logistics investigation",
            body_text=_LONG_BODY,
            published_at=_T0,
        )
        for dom in ("linkonly.com", "extract.com", "full.com")
    ]
    await ingest(str(wl.id), connectors=[FakeConnector(documents=docs, name="fake")], since=_T0)

    rows = (
        await session.execute(
            select(Source.domain, Document.body, Document.summary).join(
                Source, Source.id == Document.source_id
            )
        )
    ).all()
    by_domain = {domain: (body, summary) for domain, body, summary in rows}

    link_body, link_summary = by_domain["linkonly.com"]
    assert link_body is None
    assert link_summary is not None and len(link_summary) <= 300

    ext_body, ext_summary = by_domain["extract.com"]
    assert ext_body is None
    assert ext_summary is not None and len(ext_summary) <= 400

    full_body, _ = by_domain["full.com"]
    assert full_body is not None and len(full_body) > 400


@pytest.mark.asyncio
async def test_newly_discovered_source_is_link_only(session: AsyncSession) -> None:
    await _reset(session)
    wl = await _watchlist(session)
    doc = RawDocument(
        source_domain="brandnew.example",
        url="https://brandnew.example/story",
        title="Cross-border logistics investigation",
        body_text=_LONG_BODY,
        published_at=_T0,
    )
    await ingest(str(wl.id), connectors=[FakeConnector(documents=[doc], name="fake")], since=_T0)

    src = (
        await session.execute(select(Source).where(Source.domain == "brandnew.example"))
    ).scalar_one()
    assert str(src.content_rights) == "link_only"
    stored = (await session.execute(select(Document.body, Document.summary))).one()
    assert stored[0] is None
    assert stored[1] is not None and len(stored[1]) <= 300
