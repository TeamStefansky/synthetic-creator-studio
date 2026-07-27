"""Source-layer API: sources + rights, feed subscriptions, batch import, API sources.

The single most confusing distinction in this product — *source* country (where
an outlet is based) vs *subject* country (what a story is about) — lives on the
interests API (see ``interests.py``); here we manage the outlets and feeds.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import (
    Pagination,
    get_batch_dispatch,
    get_fetcher,
    get_session,
    pagination,
)
from newsradar.api.schemas import (
    ApiSourceCreateIn,
    ApiSourceOut,
    ApiSourcePatchIn,
    BatchIn,
    BatchJobDetailOut,
    BatchJobOut,
    BatchResultOut,
    DiscoveredFeedOut,
    DiscoverIn,
    FeedCreateIn,
    FeedHealthOut,
    FeedOut,
    FeedPatchIn,
    OpmlImportOut,
    Page,
    RightsPatchIn,
    SourceCreateIn,
    SourceOut,
    SourcePatchIn,
)
from newsradar.db.models import (
    ApiSource,
    FeedSubscription,
    Source,
    SourceImportJob,
    SourceImportResult,
)
from newsradar.feeds.batch import MAX_BATCH_LINES, split_input
from newsradar.feeds.discovery import discover_feeds
from newsradar.feeds.http import Fetcher
from newsradar.feeds.opml import OpmlFeed, build_opml, parse_opml
from newsradar.feeds.subscriptions import create_subscription

router = APIRouter(tags=["sources"])


# --------------------------------------------------------------------------------------
# Feeds — literal paths first so they are not captured by /feeds/{feed_id}.
# --------------------------------------------------------------------------------------


@router.post("/feeds/discover", response_model=list[DiscoveredFeedOut])
async def discover(
    body: DiscoverIn, fetcher: Fetcher = Depends(get_fetcher)
) -> list[DiscoveredFeedOut]:
    """Discover feeds for a pasted site URL (single-site, inline)."""

    try:
        feeds = await discover_feeds(body.url, fetcher=fetcher)
    finally:
        await fetcher.aclose()
    return [
        DiscoveredFeedOut(
            feed_url=f.feed_url,
            title=f.title,
            site_title=f.site_title,
            item_count=f.item_count,
            last_published_at=f.last_published_at,
            detected_lang=f.detected_lang,
            detected_country=f.detected_country,
        )
        for f in feeds
    ]


@router.get("/feeds/health", response_model=list[FeedHealthOut])
async def feeds_health(session: AsyncSession = Depends(get_session)) -> list[FeedHealthOut]:
    """Per-subscription polling health (active flag, failures, last-ok)."""

    rows = (
        (await session.execute(select(FeedSubscription).order_by(FeedSubscription.feed_url)))
        .scalars()
        .all()
    )
    return [
        FeedHealthOut(
            feed_url=s.feed_url,
            active=s.active,
            consecutive_failures=s.consecutive_failures,
            last_ok_at=s.last_ok_at,
            last_polled_at=s.last_polled_at,
            deactivated_reason=s.deactivated_reason,
        )
        for s in rows
    ]


class _OpmlImportIn(BaseModel):
    opml: str


@router.post("/feeds/import-opml", response_model=OpmlImportOut)
async def import_opml(
    body: _OpmlImportIn, session: AsyncSession = Depends(get_session)
) -> OpmlImportOut:
    """Import an OPML document, subscribing to each feed (folders become tags)."""

    feeds = parse_opml(body.opml)
    imported = 0
    duplicates = 0
    out_feeds: list[FeedOut] = []
    for feed in feeds:
        result = await create_subscription(
            session, feed.feed_url, title=feed.title, tags=feed.tags or None
        )
        if result.created:
            imported += 1
        else:
            duplicates += 1
        out_feeds.append(FeedOut.model_validate(result.subscription))
    await session.commit()
    return OpmlImportOut(imported=imported, duplicates=duplicates, feeds=out_feeds)


@router.get("/feeds/export-opml")
async def export_opml(session: AsyncSession = Depends(get_session)) -> Response:
    """Export all subscriptions as an OPML 2.0 document (tags become folders)."""

    subs = (await session.execute(select(FeedSubscription))).scalars().all()
    feeds = [OpmlFeed(feed_url=s.feed_url, title=s.title, tags=list(s.tags or [])) for s in subs]
    xml = build_opml(feeds)
    return Response(content=xml, media_type="text/x-opml")


@router.get("/feeds", response_model=Page[FeedOut])
async def list_feeds(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[FeedOut]:
    total = (await session.execute(select(func.count()).select_from(FeedSubscription))).scalar_one()
    rows = (
        (
            await session.execute(
                select(FeedSubscription)
                .order_by(FeedSubscription.created_at.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[FeedOut.model_validate(r) for r in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/feeds", response_model=FeedOut, status_code=201)
async def create_feed(body: FeedCreateIn, session: AsyncSession = Depends(get_session)) -> FeedOut:
    result = await create_subscription(
        session,
        body.feed_url,
        title=body.title,
        tags=body.tags,
        country_code=body.country_code,
        lang=body.lang,
        poll_interval_seconds=body.poll_interval_seconds,
    )
    await session.commit()
    if result.duplicate:
        raise HTTPException(status_code=409, detail="feed already subscribed")
    return FeedOut.model_validate(result.subscription)


@router.patch("/feeds/{feed_id}", response_model=FeedOut)
async def patch_feed(
    feed_id: uuid.UUID, body: FeedPatchIn, session: AsyncSession = Depends(get_session)
) -> FeedOut:
    sub = await session.get(FeedSubscription, feed_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="feed not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sub, field, value)
    await session.commit()
    return FeedOut.model_validate(sub)


@router.delete("/feeds/{feed_id}", status_code=204)
async def delete_feed(feed_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> Response:
    sub = await session.get(FeedSubscription, feed_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="feed not found")
    await session.delete(sub)
    await session.commit()
    return Response(status_code=204)


# --------------------------------------------------------------------------------------
# Batch source onboarding — literal paths before /sources/{source_id}.
# --------------------------------------------------------------------------------------


@router.post("/sources/batch", response_model=BatchJobOut, status_code=202)
async def create_batch(
    body: BatchIn,
    session: AsyncSession = Depends(get_session),
    dispatch: Callable[[uuid.UUID, list[str]], Awaitable[None]] = Depends(get_batch_dispatch),
) -> BatchJobOut:
    """Accept pasted site URLs and start discovery off-request; returns a job id."""

    lines = split_input(body.text)
    if not lines:
        raise HTTPException(status_code=422, detail="no URLs provided")
    if len(lines) > MAX_BATCH_LINES:
        raise HTTPException(status_code=422, detail=f"at most {MAX_BATCH_LINES} lines")
    job = SourceImportJob(status="pending", total=len(lines))
    session.add(job)
    await session.commit()
    await dispatch(job.id, lines)
    return BatchJobOut.model_validate(job)


@router.get("/sources/batch/{job_id}", response_model=BatchJobDetailOut)
async def get_batch(
    job_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> BatchJobDetailOut:
    job = await session.get(SourceImportJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    results = (
        (
            await session.execute(
                select(SourceImportResult)
                .where(SourceImportResult.job_id == job_id)
                .order_by(SourceImportResult.input_line)
            )
        )
        .scalars()
        .all()
    )
    return BatchJobDetailOut(
        id=job.id,
        status=str(job.status),
        total=job.total,
        processed=job.processed,
        created_at=job.created_at,
        finished_at=job.finished_at,
        results=[BatchResultOut.model_validate(r) for r in results],
    )


# --------------------------------------------------------------------------------------
# Sources + rights management.
# --------------------------------------------------------------------------------------


@router.get("/sources", response_model=Page[SourceOut])
async def list_sources(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[SourceOut]:
    total = (await session.execute(select(func.count()).select_from(Source))).scalar_one()
    rows = (
        (
            await session.execute(
                select(Source).order_by(Source.domain).limit(page.limit).offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[SourceOut.model_validate(s) for s in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/sources", response_model=SourceOut, status_code=201)
async def create_source(
    body: SourceCreateIn, session: AsyncSession = Depends(get_session)
) -> SourceOut:
    """Create a source manually. Always starts at ``link_only`` (rights never inferred)."""

    source = Source(
        name=body.name,
        domain=body.domain.lower(),
        source_type=body.source_type,
        country_code=body.country_code,
        lang=body.lang,
        tier=body.tier,
        credibility_score=0.5,
        allows_fulltext_storage=False,
        content_rights="link_only",
        active=True,
    )
    session.add(source)
    await session.commit()
    return SourceOut.model_validate(source)


@router.get("/sources/{source_id}", response_model=SourceOut)
async def get_source(
    source_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> SourceOut:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="source not found")
    return SourceOut.model_validate(source)


@router.patch("/sources/{source_id}", response_model=SourceOut)
async def patch_source(
    source_id: uuid.UUID, body: SourcePatchIn, session: AsyncSession = Depends(get_session)
) -> SourceOut:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="source not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(source, field, value)
    await session.commit()
    return SourceOut.model_validate(source)


@router.patch("/sources/{source_id}/rights", response_model=SourceOut)
async def patch_rights(
    source_id: uuid.UUID, body: RightsPatchIn, session: AsyncSession = Depends(get_session)
) -> SourceOut:
    """Change a source's ``content_rights``. Upgrading requires a ``rights_note``.

    An upgrade to ``full_ok`` (or ``extract_ok``) without a note is rejected with
    422 — rights are a deliberate, documented human decision, never inferred.
    """

    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="source not found")

    note = (body.rights_note or "").strip()
    if body.content_rights in ("full_ok", "extract_ok") and not note:
        raise HTTPException(
            status_code=422,
            detail=f"upgrading rights to {body.content_rights} requires a rights_note",
        )

    source.content_rights = body.content_rights  # type: ignore[assignment]
    source.allows_fulltext_storage = body.content_rights == "full_ok"
    if note:
        source.rights_note = note
    await session.commit()
    return SourceOut.model_validate(source)


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(
    source_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="source not found")
    await session.delete(source)
    await session.commit()
    return Response(status_code=204)


# --------------------------------------------------------------------------------------
# API sources (global-provider query scopes).
# --------------------------------------------------------------------------------------


@router.get("/api-sources", response_model=Page[ApiSourceOut])
async def list_api_sources(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[ApiSourceOut]:
    total = (await session.execute(select(func.count()).select_from(ApiSource))).scalar_one()
    rows = (
        (
            await session.execute(
                select(ApiSource)
                .order_by(ApiSource.created_at.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[ApiSourceOut.model_validate(a) for a in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/api-sources", response_model=ApiSourceOut, status_code=201)
async def create_api_source(
    body: ApiSourceCreateIn, session: AsyncSession = Depends(get_session)
) -> ApiSourceOut:
    api_source = ApiSource(
        provider=body.provider,
        name=body.name,
        enabled=body.enabled,
        country_filter=body.country_filter,
        lang_filter=body.lang_filter,
        extra_params=body.extra_params,
    )
    session.add(api_source)
    await session.commit()
    return ApiSourceOut.model_validate(api_source)


@router.patch("/api-sources/{api_source_id}", response_model=ApiSourceOut)
async def patch_api_source(
    api_source_id: uuid.UUID,
    body: ApiSourcePatchIn,
    session: AsyncSession = Depends(get_session),
) -> ApiSourceOut:
    api_source = await session.get(ApiSource, api_source_id)
    if api_source is None:
        raise HTTPException(status_code=404, detail="api source not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(api_source, field, value)
    await session.commit()
    return ApiSourceOut.model_validate(api_source)


@router.delete("/api-sources/{api_source_id}", status_code=204)
async def delete_api_source(
    api_source_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    api_source = await session.get(ApiSource, api_source_id)
    if api_source is None:
        raise HTTPException(status_code=404, detail="api source not found")
    await session.delete(api_source)
    await session.commit()
    return Response(status_code=204)
