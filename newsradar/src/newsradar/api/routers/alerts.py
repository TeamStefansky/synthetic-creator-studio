"""Alerts endpoint — recent alerts, filterable by severity and watchlist."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.deps import Pagination, get_session, pagination
from newsradar.api.schemas import AlertOut, Page
from newsradar.db.models import Alert, Event

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=Page[AlertOut])
async def list_alerts(
    session: AsyncSession = Depends(get_session),
    page: Pagination = Depends(pagination),
    severity: str | None = Query(default=None),
    watchlist_id: uuid.UUID | None = Query(default=None),
) -> Page[AlertOut]:
    """List alerts (newest first), optionally filtered by severity/watchlist."""

    conditions = []
    if severity is not None:
        conditions.append(Alert.severity == severity)
    if watchlist_id is not None:
        conditions.append(
            Alert.event_id.in_(select(Event.id).where(Event.watchlist_id == watchlist_id))
        )

    total = (
        await session.execute(select(func.count()).select_from(Alert).where(*conditions))
    ).scalar_one()
    rows = (
        (
            await session.execute(
                select(Alert)
                .where(*conditions)
                .order_by(Alert.fired_at.desc().nullslast())
                .limit(page.limit)
                .offset(page.offset)
            )
        )
        .scalars()
        .all()
    )
    return Page(
        items=[AlertOut.model_validate(a) for a in rows],
        total=int(total),
        limit=page.limit,
        offset=page.offset,
    )
