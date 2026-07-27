"""Shared FastAPI dependencies: DB session, pagination, and the report LLM seam."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

from fastapi import Query
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.session import get_sessionmaker
from newsradar.feeds.http import Fetcher, HttpFetcher
from newsradar.llm.client import LLMClient, default_llm_client
from newsradar.pipeline.embed import Embedder, default_embedder


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield a scoped async session (FastAPI dependency)."""

    factory = get_sessionmaker()
    async with factory() as session:
        yield session


def get_report_llm() -> LLMClient:
    """Return the LLM client used for report generation.

    A dependency seam so tests can override it with the deterministic fake client
    (the production Anthropic client needs credentials that are absent in CI).
    """

    return default_llm_client()


def get_embedder() -> Embedder:
    """Return the embedder used to embed interest descriptions.

    A dependency seam so tests inject the deterministic ``HashingEmbedder``
    (the real ``multilingual-e5-large`` model cannot download in CI).
    """

    return default_embedder()


def get_fetcher() -> Fetcher:
    """Return the HTTP fetcher for feed discovery (overridden with a recorded one in tests)."""

    return HttpFetcher()


def get_batch_dispatch() -> Callable[[uuid.UUID, list[str]], Awaitable[None]]:
    """Return the batch-import dispatcher.

    Production enqueues the Celery task (returns immediately); tests override this
    to run the batch inline against recorded fixtures.
    """

    async def _dispatch(job_id: uuid.UUID, lines: list[str]) -> None:
        from newsradar.tasks.sources import import_sources

        import_sources.delay(str(job_id), lines)

    return _dispatch


@dataclass(frozen=True)
class Pagination:
    """Standard limit/offset pagination parameters."""

    limit: int
    offset: int


def pagination(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Pagination:
    """FastAPI dependency producing validated limit/offset."""

    return Pagination(limit=limit, offset=offset)
