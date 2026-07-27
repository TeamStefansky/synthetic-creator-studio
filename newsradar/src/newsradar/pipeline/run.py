"""Enrichment pipeline orchestration: embed -> enrich -> stance -> cluster -> summarize.

This is the single async entry point shared by the Celery tasks and the
end-to-end test. Providers (embedder, LLM, geo resolver) are injected so tests
run against the deterministic hashing embedder and the fake LLM, while production
uses the real sentence-transformers model and Anthropic client.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from newsradar.db.models import Watchlist
from newsradar.db.session import get_sessionmaker
from newsradar.llm.client import LLMClient
from newsradar.logging import get_logger
from newsradar.pipeline import cluster, enrich, stance, summarize
from newsradar.pipeline.embed import Embedder, embed_documents
from newsradar.pipeline.geonames import GeoNamesResolver

log = get_logger(__name__)


@dataclass
class PipelineResult:
    """Per-run counters across the enrichment pipeline stages."""

    embedded: int = 0
    enriched: int = 0
    stance_pairs: int = 0
    events_created: int = 0
    events_updated: int = 0
    summaries: int = 0


async def run_pipeline(
    watchlist_id: uuid.UUID,
    *,
    embedder: Embedder,
    llm: LLMClient,
    geo: GeoNamesResolver | None = None,
    force: bool = False,
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
) -> PipelineResult:
    """Run the full enrichment pipeline for one watchlist."""

    factory = sessionmaker or get_sessionmaker()
    geo = geo or GeoNamesResolver()
    result = PipelineResult()

    async with factory() as session:
        result.embedded = await embed_documents(session, embedder, force=force)
        result.enriched = await enrich.enrich_documents(
            session, llm, geo, watchlist_id=watchlist_id, force=force
        )
        result.stance_pairs = await stance.assess_stance(
            session, llm, watchlist_id=watchlist_id, force=force
        )
        cluster_res = await cluster.cluster_watchlist(session, watchlist_id=watchlist_id)
        result.events_created = cluster_res.events_created
        result.events_updated = cluster_res.events_updated
        await cluster.advance_statuses(session, watchlist_id=watchlist_id)
        result.summaries = await summarize.summarize_events(
            session, llm, watchlist_id=watchlist_id, force=force
        )

    log.info(
        "pipeline.run",
        watchlist=str(watchlist_id),
        embedded=result.embedded,
        enriched=result.enriched,
        stance_pairs=result.stance_pairs,
        events_created=result.events_created,
        summaries=result.summaries,
    )
    return result


async def active_watchlist_ids(
    sessionmaker: async_sessionmaker[AsyncSession] | None = None,
) -> list[uuid.UUID]:
    """Return the ids of all active watchlists."""

    factory = sessionmaker or get_sessionmaker()
    async with factory() as session:
        rows = (
            (await session.execute(select(Watchlist.id).where(Watchlist.active.is_(True))))
            .scalars()
            .all()
        )
    return [uuid.UUID(str(r)) for r in rows]
