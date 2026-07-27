"""Batch source onboarding: discover feeds for many pasted URLs and subscribe.

Discovery is network-bound and runs concurrently (bounded to ``concurrency``,
with a per-site timeout); persistence is then applied sequentially on one session
so a single bad line can never fail the whole job. Every line produces exactly
one :class:`~newsradar.db.models.SourceImportResult` row.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import re
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from newsradar.db.models import ImportJobStatus, SourceImportJob, SourceImportResult
from newsradar.feeds.discovery import DiscoveredFeed, discover_feeds, normalize_site_url
from newsradar.feeds.http import Fetcher, HttpFetcher
from newsradar.feeds.subscriptions import create_subscription
from newsradar.logging import get_logger

log = get_logger(__name__)

MAX_BATCH_LINES = 500
DEFAULT_CONCURRENCY = 8
DEFAULT_PER_SITE_TIMEOUT = 15.0

_SPLIT_RE = re.compile(r"[\n,]+")


def split_input(raw: str) -> list[str]:
    """Split pasted input (newline- or comma-separated) into non-empty trimmed lines."""

    return [line.strip() for line in _SPLIT_RE.split(raw or "") if line.strip()]


@dataclass(slots=True)
class _LineWork:
    input_line: str
    normalized_url: str | None
    feeds: list[DiscoveredFeed]
    error: str | None


async def _discover_line(
    line: str,
    fetcher: Fetcher,
    timeout: float,
    sem: asyncio.Semaphore,
) -> _LineWork:
    async with sem:
        try:
            normalized = normalize_site_url(line)
        except ValueError as exc:
            return _LineWork(line, None, [], f"invalid: {exc}")
        try:
            feeds = await asyncio.wait_for(discover_feeds(line, fetcher=fetcher), timeout=timeout)
        except TimeoutError:
            return _LineWork(line, normalized, [], "discovery timed out")
        except Exception as exc:  # noqa: BLE001 - a bad site must not fail the job
            return _LineWork(line, normalized, [], str(exc))
        return _LineWork(line, normalized, feeds, None)


async def _persist_line(session: AsyncSession, job_id: object, work: _LineWork) -> str:
    """Persist one line's outcome; returns the result status."""

    if work.normalized_url is None:
        _add_result(session, job_id, work, status="invalid", feed_url=None, title=None)
        return "invalid"
    if work.error is not None:
        _add_result(session, job_id, work, status="error", feed_url=None, title=None)
        return "error"
    if not work.feeds:
        _add_result(session, job_id, work, status="no_feed", feed_url=None, title=None)
        return "no_feed"

    any_created = False
    primary = work.feeds[0]
    for feed in work.feeds:
        result = await create_subscription(
            session,
            feed.feed_url,
            title=feed.title,
            country_code=feed.detected_country,
            lang=feed.detected_lang,
        )
        any_created = any_created or result.created
    status = "added" if any_created else "duplicate"
    _add_result(
        session, job_id, work, status=status, feed_url=primary.feed_url, title=primary.title
    )
    return status


def _add_result(
    session: AsyncSession,
    job_id: object,
    work: _LineWork,
    *,
    status: str,
    feed_url: str | None,
    title: str | None,
) -> None:
    session.add(
        SourceImportResult(
            job_id=job_id,
            input_line=work.input_line,
            normalized_url=work.normalized_url,
            status=status,
            feed_url=feed_url,
            title=title,
            error=work.error,
        )
    )


async def process_batch(
    sessionmaker: async_sessionmaker[AsyncSession],
    job_id: object,
    lines: list[str],
    *,
    fetcher: Fetcher | None = None,
    concurrency: int = DEFAULT_CONCURRENCY,
    per_site_timeout: float = DEFAULT_PER_SITE_TIMEOUT,
) -> None:
    """Run a batch import job to completion, updating its job + result rows."""

    own_fetcher = fetcher is None
    active_fetcher: Fetcher = fetcher or HttpFetcher()

    async with sessionmaker() as session:
        job = await session.get(SourceImportJob, job_id)
        if job is not None:
            job.status = ImportJobStatus.running
            job.total = len(lines)
            job.processed = 0
            await session.commit()

    sem = asyncio.Semaphore(concurrency)
    try:
        works = await asyncio.gather(
            *(_discover_line(line, active_fetcher, per_site_timeout, sem) for line in lines)
        )
    finally:
        if own_fetcher:
            await active_fetcher.aclose()

    async with sessionmaker() as session:
        processed = 0
        for work in works:
            try:
                await _persist_line(session, job_id, work)
            except Exception as exc:  # noqa: BLE001 - never let one line fail the job
                log.warning("feeds.batch.line_failed", line=work.input_line, error=str(exc))
                _add_result(session, job_id, work, status="error", feed_url=None, title=None)
            processed += 1
        job = await session.get(SourceImportJob, job_id)
        if job is not None:
            job.processed = processed
            job.status = ImportJobStatus.done
            job.finished_at = dt.datetime.now(dt.UTC)
        await session.commit()
    log.info("feeds.batch.done", job_id=str(job_id), lines=len(lines))
