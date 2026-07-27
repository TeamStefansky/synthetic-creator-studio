"""Shared DB factories for P2 pipeline tests (sources, documents, watchlists)."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    Document,
    DocumentMatch,
    Source,
    Watchlist,
    WatchlistEntity,
)

T0 = dt.datetime(2026, 7, 20, 8, 0, tzinfo=dt.UTC)


async def reset(session: AsyncSession) -> None:
    """Truncate every table P2 tests touch, so the shared DB starts clean."""

    await session.execute(
        text(
            "TRUNCATE events, event_documents, event_metrics, stance_assessments, "
            "document_enrichment, document_matches, documents, watchlist_entities, "
            "watchlist_terms, watchlists, sources, llm_calls CASCADE"
        )
    )
    await session.commit()


async def make_source(
    session: AsyncSession, domain: str, *, tier: int = 2, source_type: str = "news"
) -> Source:
    src = Source(
        name=domain,
        domain=domain,
        source_type=source_type,
        tier=tier,
        credibility_score=0.7,
        allows_fulltext_storage=True,
        active=True,
    )
    session.add(src)
    await session.flush()
    return src


async def make_watchlist(session: AsyncSession, name: str | None = None) -> Watchlist:
    wl = Watchlist(name=name or f"wl-{uuid.uuid4().hex[:8]}")
    session.add(wl)
    await session.flush()
    return wl


async def add_entity(
    session: AsyncSession,
    watchlist: Watchlist,
    name: str,
    *,
    entity_type: str = "person",
    aliases: list[str] | None = None,
    is_primary: bool = False,
) -> WatchlistEntity:
    ent = WatchlistEntity(
        watchlist_id=watchlist.id,
        name=name,
        entity_type=entity_type,
        aliases=aliases,
        is_primary=is_primary,
    )
    session.add(ent)
    await session.flush()
    return ent


async def make_document(
    session: AsyncSession,
    source: Source,
    *,
    title: str | None = None,
    body: str | None = None,
    summary: str | None = None,
    lang: str = "en",
    published_at: dt.datetime | None = None,
    url: str | None = None,
    dedup_of: uuid.UUID | None = None,
    media_type: str = "article",
    engagement: dict[str, object] | None = None,
    raw: dict[str, object] | None = None,
) -> Document:
    slug = uuid.uuid4().hex[:12]
    doc = Document(
        source_id=source.id,
        external_id=slug,
        url=url or f"https://{source.domain}/{slug}",
        canonical_url=url or f"https://{source.domain}/{slug}",
        url_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        simhash=None,
        title=title,
        body=body,
        summary=summary,
        lang=lang,
        published_at=published_at or T0,
        fetched_at=T0,
        media_type=media_type,
        engagement=engagement,
        raw=raw or {},
        dedup_of=dedup_of,
    )
    session.add(doc)
    await session.flush()
    return doc


async def add_match(
    session: AsyncSession,
    document: Document,
    watchlist: Watchlist,
    matched_terms: list[str],
) -> DocumentMatch:
    match = DocumentMatch(
        document_id=document.id,
        watchlist_id=watchlist.id,
        matched_terms=matched_terms,
        match_score=1.0,
    )
    session.add(match)
    await session.flush()
    return match
