"""Shared helpers for edition/serializer/site tests."""

from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    ContentRights,
    DocumentMatch,
    Source,
    Watchlist,
    WatchlistKind,
)
from tests.pipeline import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)


async def reset(session: AsyncSession) -> None:
    await session.execute(
        text(
            "TRUNCATE edition_items, editions, translations, share_links, "
            "event_documents, event_metrics, events, document_media, "
            "document_matches, document_enrichment, documents, feed_subscriptions, "
            "watchlist_entities, watchlist_terms, watchlists, sources, llm_calls CASCADE"
        )
    )
    await session.commit()


async def make_interest(session: AsyncSession, name: str, *, active: bool = True) -> Watchlist:
    wl = Watchlist(name=name, kind=WatchlistKind.interest, active=active)
    session.add(wl)
    await session.flush()
    return wl


async def make_source(
    session: AsyncSession,
    domain: str,
    *,
    tier: int = 2,
    country_code: str | None = None,
    lang: str | None = "en",
    rights: ContentRights = ContentRights.link_only,
    name: str | None = None,
) -> Source:
    src = Source(
        name=name or domain,
        domain=domain,
        source_type="news",
        tier=tier,
        credibility_score=0.7,
        content_rights=rights,
        country_code=country_code,
        lang=lang,
        active=True,
    )
    session.add(src)
    await session.flush()
    return src


async def add_interest_match(
    session: AsyncSession,
    document_id: uuid.UUID,
    interest: Watchlist,
    *,
    match_score: float = 1.5,
    matched_terms: list[str] | None = None,
) -> DocumentMatch:
    m = DocumentMatch(
        document_id=document_id,
        watchlist_id=interest.id,
        matched_terms=matched_terms or ["kw"],
        match_score=match_score,
    )
    session.add(m)
    await session.flush()
    return m


__all__ = ["NOW", "add_interest_match", "f", "make_interest", "make_source", "reset"]
