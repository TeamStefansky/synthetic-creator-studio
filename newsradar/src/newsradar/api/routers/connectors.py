"""``GET /connectors/status`` — enabled/healthy/last-run state per connector."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from newsradar.config import get_settings
from newsradar.connectors.registry import CONNECTOR_CLASSES, build_connector, is_enabled
from newsradar.db.models import IngestionRun
from newsradar.db.session import get_sessionmaker

router = APIRouter(tags=["connectors"])


class ConnectorStatus(BaseModel):
    """Reported state of a single connector."""

    name: str
    source_type: str
    enabled: bool
    healthy: bool
    detail: str | None = None
    default_interval_seconds: int
    last_run_at: dt.datetime | None = None


class ConnectorStatusResponse(BaseModel):
    """Envelope for the connector status list."""

    connectors: list[ConnectorStatus]


async def _last_successful_runs() -> dict[str, dt.datetime]:
    factory = get_sessionmaker()
    async with factory() as session:
        rows = (
            await session.execute(
                select(IngestionRun.connector, func.max(IngestionRun.started_at))
                .where(IngestionRun.status == "ok")
                .group_by(IngestionRun.connector)
            )
        ).all()
    return {name: ts for name, ts in rows if ts is not None}


@router.get("/connectors/status", response_model=ConnectorStatusResponse)
async def connectors_status() -> ConnectorStatusResponse:
    """List every connector with its enabled/healthy flags and last successful run."""

    settings = get_settings()
    last_runs = await _last_successful_runs()

    statuses: list[ConnectorStatus] = []
    for cls in CONNECTOR_CLASSES:
        enabled = is_enabled(cls, settings)
        healthy = False
        detail: str | None = None
        if enabled:
            connector = build_connector(cls, settings)
            try:
                health = await connector.health_check()
                healthy = health.healthy
                detail = health.detail
            except Exception as exc:  # noqa: BLE001 - status endpoint must never raise
                detail = str(exc)
            finally:
                await connector.aclose()
        else:
            detail = "disabled (missing credentials)"

        statuses.append(
            ConnectorStatus(
                name=cls.name,
                source_type=str(cls.source_type),
                enabled=enabled,
                healthy=healthy,
                detail=detail,
                default_interval_seconds=cls.default_interval_seconds,
                last_run_at=last_runs.get(cls.name),
            )
        )
    return ConnectorStatusResponse(connectors=statuses)
