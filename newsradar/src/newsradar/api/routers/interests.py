"""Interests API — keyword + country targeting with a live preview.

An interest is a ``watchlists`` row with ``kind='interest'`` (reusing
``watchlist_terms`` for keywords — there is no parallel model). Country filtering
distinguishes **source** country (where the outlet is based) from **subject**
country (what the story is about); ``country_match_mode`` chooses which question
is asked. The description is embedded (e5 ``query:`` role) for hybrid semantic
matching alongside the keywords.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import Pagination, get_embedder, get_session, pagination
from newsradar.api.schemas import (
    InterestCreateIn,
    InterestOut,
    InterestPatchIn,
    InterestPreviewItemOut,
    Page,
)
from newsradar.db.models import (
    CountryMatchMode,
    DocumentMedia,
    Source,
    TermType,
    Watchlist,
    WatchlistKind,
    WatchlistTerm,
)
from newsradar.pipeline.embed import Embedder
from newsradar.pipeline.interest_router import embed_description, evaluate_interest

router = APIRouter(tags=["interests"])


async def _keywords(session: AsyncSession, watchlist_id: uuid.UUID) -> list[str]:
    rows = (
        (
            await session.execute(
                select(WatchlistTerm.term).where(WatchlistTerm.watchlist_id == watchlist_id)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


def _to_out(wl: Watchlist, keywords: list[str]) -> InterestOut:
    return InterestOut(
        id=wl.id,
        name=wl.name,
        description=wl.description,
        keywords=keywords,
        source_country_filter=wl.source_country_filter,
        subject_country_filter=wl.subject_country_filter,
        country_match_mode=str(wl.country_match_mode),
        lang_filter=wl.lang_filter,
        min_semantic_similarity=wl.min_semantic_similarity,
        active=wl.active,
        has_embedding=wl.description_embedding is not None,
    )


async def _get_interest(session: AsyncSession, interest_id: uuid.UUID) -> Watchlist:
    wl = await session.get(Watchlist, interest_id)
    if wl is None or wl.kind != WatchlistKind.interest:
        raise HTTPException(status_code=404, detail="interest not found")
    return wl


@router.get("/interests", response_model=Page[InterestOut])
async def list_interests(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[InterestOut]:
    base = select(Watchlist).where(Watchlist.kind == WatchlistKind.interest)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        (await session.execute(base.order_by(Watchlist.name).limit(page.limit).offset(page.offset)))
        .scalars()
        .all()
    )
    items = [_to_out(wl, await _keywords(session, wl.id)) for wl in rows]
    return Page(items=items, total=int(total), limit=page.limit, offset=page.offset)


@router.post("/interests", response_model=InterestOut, status_code=201)
async def create_interest(
    body: InterestCreateIn,
    session: AsyncSession = Depends(get_session),
    embedder: Embedder = Depends(get_embedder),
) -> InterestOut:
    wl = Watchlist(
        name=body.name,
        description=body.description,
        kind=WatchlistKind.interest,
        source_country_filter=body.source_countries,
        subject_country_filter=body.subject_countries,
        country_match_mode=CountryMatchMode(body.country_match_mode),
        lang_filter=body.lang_filter,
        min_semantic_similarity=body.min_semantic_similarity,
        description_embedding=embed_description(embedder, body.description),
    )
    session.add(wl)
    await session.flush()
    for kw in body.keywords:
        session.add(
            WatchlistTerm(watchlist_id=wl.id, term=kw, term_type=TermType.keyword, weight=1.0)
        )
    await session.commit()
    return _to_out(wl, list(body.keywords))


@router.get("/interests/{interest_id}", response_model=InterestOut)
async def get_interest(
    interest_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> InterestOut:
    wl = await _get_interest(session, interest_id)
    return _to_out(wl, await _keywords(session, wl.id))


@router.patch("/interests/{interest_id}", response_model=InterestOut)
async def patch_interest(
    interest_id: uuid.UUID,
    body: InterestPatchIn,
    session: AsyncSession = Depends(get_session),
    embedder: Embedder = Depends(get_embedder),
) -> InterestOut:
    wl = await _get_interest(session, interest_id)

    if body.name is not None:
        wl.name = body.name
    if body.description is not None:
        wl.description = body.description
        wl.description_embedding = embed_description(embedder, body.description)
    if body.source_countries is not None:
        wl.source_country_filter = body.source_countries
    if body.subject_countries is not None:
        wl.subject_country_filter = body.subject_countries
    if body.country_match_mode is not None:
        wl.country_match_mode = CountryMatchMode(body.country_match_mode)
    if body.lang_filter is not None:
        wl.lang_filter = body.lang_filter
    if body.min_semantic_similarity is not None:
        wl.min_semantic_similarity = body.min_semantic_similarity
    if body.active is not None:
        wl.active = body.active

    if body.keywords is not None:
        for term in await session.execute(
            select(WatchlistTerm).where(WatchlistTerm.watchlist_id == wl.id)
        ):
            await session.delete(term[0])
        for kw in body.keywords:
            session.add(
                WatchlistTerm(watchlist_id=wl.id, term=kw, term_type=TermType.keyword, weight=1.0)
            )

    await session.commit()
    return _to_out(wl, await _keywords(session, wl.id))


@router.delete("/interests/{interest_id}", status_code=204)
async def delete_interest(
    interest_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    wl = await _get_interest(session, interest_id)
    await session.delete(wl)
    await session.commit()


@router.get("/interests/{interest_id}/preview", response_model=list[InterestPreviewItemOut])
async def preview_interest(
    interest_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=10, ge=1, le=100),
) -> list[InterestPreviewItemOut]:
    """Return the most recent documents matching this interest, to calibrate the threshold."""

    wl = await _get_interest(session, interest_id)
    hits = await evaluate_interest(session, wl, limit=limit)
    if not hits:
        return []

    doc_ids = [h.document.id for h in hits]
    source_ids = {h.document.source_id for h in hits}
    names: dict[uuid.UUID, str] = {
        row[0]: row[1]
        for row in (
            await session.execute(select(Source.id, Source.name).where(Source.id.in_(source_ids)))
        ).all()
    }
    images: dict[uuid.UUID, str | None] = {
        row[0]: row[1]
        for row in (
            await session.execute(
                select(DocumentMedia.document_id, DocumentMedia.image_url).where(
                    DocumentMedia.document_id.in_(doc_ids)
                )
            )
        ).all()
    }
    return [
        InterestPreviewItemOut(
            document_id=h.document.id,
            source_name=str(names.get(h.document.source_id, "")),
            url=h.document.url,
            title=h.document.title,
            published_at=h.document.published_at,
            matched_terms=h.result.matched_terms,
            match_score=h.result.score,
            source_country=h.source_country,
            subject_country=h.subject_country,
            image_url=images.get(h.document.id),
        )
        for h in hits
    ]
