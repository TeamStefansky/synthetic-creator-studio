"""Celery enrichment tasks and beat schedule.

The task chain is ``ingest -> embed -> enrich -> stance -> cluster -> summarize``.
Ingestion (P1) is unchanged; ``ingest_then_enrich_all`` chains the enrichment
pipeline after it. Enrichment also runs on its own cadence (every 5 minutes) over
unenriched documents, and reclustering runs nightly at 03:00 Asia/Jerusalem.

Celery tasks are thin sync wrappers that call the async pipeline via
``asyncio.run`` (project convention), disposing the engine around each run.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable
from typing import Any

from celery import chain
from celery.schedules import crontab, schedule

from newsradar.db.session import get_engine, get_sessionmaker
from newsradar.llm.client import default_llm_client
from newsradar.logging import get_logger
from newsradar.pipeline.embed import default_embedder
from newsradar.pipeline.geonames import GeoNamesResolver
from newsradar.pipeline.run import PipelineResult, active_watchlist_ids, run_pipeline
from newsradar.tasks.celery_app import celery_app

log = get_logger(__name__)

ENRICH_INTERVAL_SECONDS = 5 * 60


def _run_async[T](coro: Awaitable[T]) -> T:
    try:
        return asyncio.run(coro)  # type: ignore[arg-type]
    finally:
        with contextlib.suppress(Exception):
            asyncio.run(get_engine().dispose())
        get_engine.cache_clear()
        get_sessionmaker.cache_clear()


def _summarize(wl_id: str, result: PipelineResult) -> dict[str, Any]:
    return {
        "watchlist_id": wl_id,
        "embedded": result.embedded,
        "enriched": result.enriched,
        "stance_pairs": result.stance_pairs,
        "events_created": result.events_created,
        "events_updated": result.events_updated,
        "summaries": result.summaries,
    }


@celery_app.task(name="newsradar.enrich_watchlist")  # type: ignore[untyped-decorator]
def enrich_watchlist(watchlist_id: str) -> dict[str, Any]:
    """Run the full enrichment pipeline for one watchlist (prod providers)."""

    import uuid

    async def _do() -> PipelineResult:
        return await run_pipeline(
            uuid.UUID(watchlist_id),
            embedder=default_embedder(),
            llm=default_llm_client(),
            geo=GeoNamesResolver(),
        )

    return _summarize(watchlist_id, _run_async(_do()))


@celery_app.task(name="newsradar.enrich_all")  # type: ignore[untyped-decorator]
def enrich_all() -> list[dict[str, Any]]:
    """Run the enrichment pipeline across every active watchlist (beat every 5 min)."""

    import uuid

    async def _do() -> list[tuple[str, PipelineResult]]:
        embedder = default_embedder()
        llm = default_llm_client()
        geo = GeoNamesResolver()
        out: list[tuple[str, PipelineResult]] = []
        for wl_id in await active_watchlist_ids():
            res = await run_pipeline(uuid.UUID(str(wl_id)), embedder=embedder, llm=llm, geo=geo)
            out.append((str(wl_id), res))
        return out

    return [_summarize(wl_id, res) for wl_id, res in _run_async(_do())]


@celery_app.task(name="newsradar.ingest_then_enrich_all")  # type: ignore[untyped-decorator]
def ingest_then_enrich_all() -> str:
    """Chain full ingestion, then the enrichment pipeline across all watchlists."""

    from newsradar.tasks.ingest import ingest_all

    chain(ingest_all.si(), enrich_all.si()).apply_async()
    return "scheduled"


def _register_enrichment_beat() -> None:
    celery_app.conf.beat_schedule["enrichment-sweep"] = {
        "task": "newsradar.enrich_all",
        "schedule": schedule(run_every=ENRICH_INTERVAL_SECONDS),
    }
    celery_app.conf.beat_schedule["recluster-nightly"] = {
        "task": "newsradar.recluster_all",
        # 03:00 in the app timezone (Asia/Jerusalem; celery_app sets the tz).
        "schedule": crontab(hour=3, minute=0),
    }


_register_enrichment_beat()
