"""Watchlist-scoped read endpoints: watchlists, events, trends, geo."""

from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import Pagination, get_session, pagination
from newsradar.api.schemas import (
    CountryCountOut,
    EventOut,
    GeoOut,
    HotZoneOut,
    Page,
    TrendOut,
    WatchlistOut,
)
from newsradar.db.models import Event, Trend, Watchlist
from newsradar.signals import geo as geo_signals

router = APIRouter(tags=["watchlists"])


@router.get("/watchlists", response_model=Page[WatchlistOut])
async def list_watchlists(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[WatchlistOut]:
    """List watchlists (paginated)."""

    total = (await session.execute(select(func.count()).select_from(Watchlist))).scalar_one()
    rows = (
        (
            await session.execute(
                select(Watchlist).order_by(Watchlist.name).limit(page.limit).offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[WatchlistOut.model_validate(w) for w in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/watchlists/{watchlist_id}/events", response_model=Page[EventOut])
async def list_events(
    watchlist_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
    status: str | None = Query(default=None),
    min_heat: float | None = Query(default=None, ge=0, le=100),
    since: dt.datetime | None = Query(default=None),
    until: dt.datetime | None = Query(default=None),
) -> Page[EventOut]:
    """List a watchlist's events, filtered and sorted by heat (desc)."""

    conditions = [Event.watchlist_id == watchlist_id]
    if status is not None:
        conditions.append(Event.status == status)
    if min_heat is not None:
        conditions.append(Event.heat_score >= min_heat)
    if since is not None:
        conditions.append(Event.last_seen_at >= since)
    if until is not None:
        conditions.append(Event.last_seen_at <= until)

    total = (
        await session.execute(select(func.count()).select_from(Event).where(*conditions))
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(Event)
                .where(*conditions)
                .order_by(Event.heat_score.desc(), Event.last_seen_at.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[EventOut.model_validate(e) for e in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/watchlists/{watchlist_id}/trends", response_model=Page[TrendOut])
async def list_trends(
    watchlist_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
) -> Page[TrendOut]:
    """List detected trends for a watchlist, strongest lift first."""

    total = (
        await session.execute(
            select(func.count()).select_from(Trend).where(Trend.watchlist_id == watchlist_id)
        )
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(Trend)
                .where(Trend.watchlist_id == watchlist_id)
                .order_by(Trend.lift.desc())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[TrendOut.model_validate(t) for t in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/watchlists/{watchlist_id}/geo", response_model=GeoOut)
async def watchlist_geo(
    watchlist_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> GeoOut:
    """Current geographic hot zones and country breakdown for a watchlist."""

    now = dt.datetime.now(dt.UTC)
    zones = await geo_signals.hot_zones(session, watchlist_id, now=now)
    counts = await geo_signals.geo_country_counts(session, watchlist_id, now=now)
    return GeoOut(
        hot_zones=[
            HotZoneOut(
                h3=z.h3,
                country_code=z.country_code,
                lat=z.lat,
                lon=z.lon,
                doc_count=z.doc_count,
                z=z.z,
                top_event_ids=z.top_event_ids,
            )
            for z in zones
        ],
        country_breakdown=[
            CountryCountOut(country_code=cc, doc_count=c)
            for cc, c in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        ],
    )
