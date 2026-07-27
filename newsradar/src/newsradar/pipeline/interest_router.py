"""Route documents to interests (``kind='interest'`` watchlists).

An interest matches a document when the keyword/boolean matcher fires OR the
document embedding is cosine-similar enough to the interest's
``description_embedding``; the country filter is then applied per
``country_match_mode``. This module owns the DB glue; the matching predicate and
country logic live in :mod:`newsradar.pipeline.matcher` and are shared with the
``preview`` endpoint so the preview and the persisted routing agree exactly.

The monitoring path (``kind='monitoring'``) never enters this module.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import QueryTerm
from newsradar.db.models import (
    Document,
    DocumentEnrichment,
    DocumentMatch,
    Source,
    Watchlist,
    WatchlistTerm,
)
from newsradar.logging import get_logger
from newsradar.pipeline import matcher
from newsradar.pipeline.embed import Embedder

log = get_logger(__name__)

# How many recent candidate documents to scan when evaluating an interest.
CANDIDATE_SCAN_LIMIT = 2000


@dataclass(slots=True)
class InterestHit:
    """One document that matched an interest, with the match metadata."""

    document: Document
    result: matcher.MatchResult
    source_country: str | None
    subject_country: str | None


def embed_description(embedder: Embedder, description: str) -> list[float] | None:
    """Embed an interest description as an e5 *query*; ``None`` for empty input."""

    text = (description or "").strip()
    if not text:
        return None
    return embedder.embed_queries([text])[0]


def _to_list(vec: Any) -> list[float] | None:
    if vec is None:
        return None
    return [float(x) for x in vec]  # numpy array or list -> list[float]


async def _load_terms(session: AsyncSession, watchlist_id: object) -> list[QueryTerm]:
    rows = (
        (
            await session.execute(
                select(WatchlistTerm).where(WatchlistTerm.watchlist_id == watchlist_id)
            )
        )
        .scalars()
        .all()
    )
    return [
        QueryTerm(
            text=t.term,
            term_type=str(t.term_type),
            lang=t.lang,
            is_exclusion=t.is_exclusion,
            weight=t.weight,
        )
        for t in rows
    ]


def _doc_text(doc: Document) -> str:
    return "\n".join(p for p in (doc.title, doc.body or doc.summary) if p)


async def evaluate_interest(
    session: AsyncSession,
    watchlist: Watchlist,
    *,
    limit: int | None = None,
    scan_limit: int = CANDIDATE_SCAN_LIMIT,
) -> list[InterestHit]:
    """Return recent documents matching ``watchlist`` (an interest), newest first.

    Shared by ``GET /interests/{id}/preview`` and :func:`route_interest`.
    """

    terms = await _load_terms(session, watchlist.id)
    compiled = matcher.compile_watchlist(terms)
    description_embedding = _to_list(watchlist.description_embedding)
    min_sim = float(watchlist.min_semantic_similarity)
    lang_filter = watchlist.lang_filter
    mode = str(watchlist.country_match_mode)

    stmt = (
        select(
            Document,
            Source.country_code,
            DocumentEnrichment.embedding,
            DocumentEnrichment.geo,
        )
        .join(Source, Source.id == Document.source_id)
        .join(DocumentEnrichment, DocumentEnrichment.document_id == Document.id, isouter=True)
        .where(Document.dedup_of.is_(None))
        .order_by(Document.published_at.desc().nulls_last())
        .limit(scan_limit)
    )
    if lang_filter:
        stmt = stmt.where(Document.lang.in_(lang_filter))

    hits: list[InterestHit] = []
    for doc, source_cc, embedding, geo in (await session.execute(stmt)).all():
        result = matcher.interest_match(
            compiled,
            _doc_text(doc),
            doc.lang,
            doc_embedding=_to_list(embedding),
            description_embedding=description_embedding,
            min_similarity=min_sim,
        )
        if not result.matched:
            continue
        subject_cc = (geo or {}).get("country_code") if isinstance(geo, dict) else None
        if not matcher.country_allows(
            mode,
            source_country=source_cc,
            subject_country=subject_cc,
            source_filter=watchlist.source_country_filter,
            subject_filter=watchlist.subject_country_filter,
        ):
            continue
        hits.append(
            InterestHit(
                document=doc,
                result=result,
                source_country=source_cc,
                subject_country=subject_cc,
            )
        )
        if limit is not None and len(hits) >= limit:
            break
    return hits


async def route_interest(
    session: AsyncSession, watchlist: Watchlist, *, scan_limit: int = CANDIDATE_SCAN_LIMIT
) -> int:
    """Persist ``document_matches`` rows for an interest. Returns the number written."""

    hits = await evaluate_interest(session, watchlist, scan_limit=scan_limit)
    if not hits:
        return 0
    rows = [
        {
            "document_id": hit.document.id,
            "watchlist_id": watchlist.id,
            "matched_terms": hit.result.matched_terms,
            "match_score": hit.result.score,
        }
        for hit in hits
    ]
    stmt = pg_insert(DocumentMatch).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["document_id", "watchlist_id"],
        set_={
            "matched_terms": stmt.excluded.matched_terms,
            "match_score": stmt.excluded.match_score,
        },
    )
    await session.execute(stmt)
    await session.commit()
    log.info("interest.routed", watchlist=str(watchlist.id), matched=len(rows))
    return len(rows)


async def refresh_description_embedding(
    session: AsyncSession, watchlist: Watchlist, embedder: Embedder
) -> None:
    """Recompute and store an interest's ``description_embedding`` from its description."""

    watchlist.description_embedding = embed_description(embedder, watchlist.description or "")
    watchlist.updated_at = dt.datetime.now(dt.UTC)
    await session.flush()
