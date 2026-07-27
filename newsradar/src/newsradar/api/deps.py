"""Shared FastAPI dependencies: DB session, pagination, and the report LLM seam."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Query
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.session import get_sessionmaker
from newsradar.llm.client import LLMClient, default_llm_client


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
