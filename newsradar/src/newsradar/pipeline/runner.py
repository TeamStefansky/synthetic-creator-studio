"""Ingestion orchestration: fetch -> normalize -> match -> dedup -> upsert.

This is the single code path shared by the Celery tasks and the ``ingest_once``
CLI. It is resilient by construction: a poison document is logged and skipped
(it never stalls a batch), and each connector runs inside its own bookkeeping
row so one failing connector never aborts the others.

Persistence uses batched ``INSERT ... ON CONFLICT (url_hash) DO NOTHING`` so
re-running with the same inputs inserts zero rows.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.connectors.base import BaseConnector, QueryTerm, RawDocument, WatchlistQuery
from newsradar.db.models import (
    Document,
    DocumentMatch,
    IngestionRun,
    Source,
    Watchlist,
    WatchlistTerm,
)
from newsradar.db.session import get_sessionmaker
from newsradar.logging import get_logger
from newsradar.pipeline import dedup, matcher
from newsradar.pipeline.normalize import (
    NormalizedDocument,
    normalize_document,
    storage_for_rights,
)

log = get_logger(__name__)

DEFAULT_LOOKBACK = dt.timedelta(hours=24)
INSERT_BATCH_SIZE = 200
MAX_DOCS_PER_RUN = 5000


@dataclass
class RunResult:
    """Per-connector run counters, mirroring the ``ingestion_runs`` row."""

    connector: str
    watchlist_id: uuid.UUID | None
    fetched: int = 0
    inserted: int = 0
    duplicates: int = 0
    errors: int = 0
    status: str = "ok"
    duration_ms: int = 0


@dataclass
class _Plan:
    normalized: NormalizedDocument
    source_id: uuid.UUID
    content_rights: str
    simhash_unsigned: int
    match: matcher.MatchResult
    dedup_existing: uuid.UUID | None = None  # canonical already in the DB
    dedup_batch_hash: str | None = None  # canonical is another doc in this batch
    document_id: uuid.UUID | None = None  # filled after insert/lookup


@dataclass
class _SourceCache:
    session: AsyncSession
    _cache: dict[str, tuple[uuid.UUID, str]] = field(default_factory=dict)

    async def resolve(self, domain: str, source_type: str) -> tuple[uuid.UUID, str]:
        """Return ``(source_id, content_rights)``, creating the source if needed.

        A newly discovered source is ALWAYS ``link_only`` — rights are never
        inferred from a feed; upgrading is a deliberate manual API action.
        """

        domain = domain.lower()
        if domain in self._cache:
            return self._cache[domain]

        stmt = (
            pg_insert(Source)
            .values(
                name=domain,
                domain=domain,
                source_type=source_type,
                tier=4,
                credibility_score=0.5,
                allows_fulltext_storage=False,
                content_rights="link_only",
                active=True,
            )
            .on_conflict_do_nothing(index_elements=["domain"])
        )
        await self.session.execute(stmt)
        row = (
            await self.session.execute(
                select(Source.id, Source.content_rights).where(Source.domain == domain)
            )
        ).one()
        result = (row[0], str(row[1]))
        self._cache[domain] = result
        return result


async def load_watchlist_query(session: AsyncSession, watchlist: Watchlist) -> WatchlistQuery:
    """Build a :class:`WatchlistQuery` from a watchlist's persisted terms."""

    terms = (
        (
            await session.execute(
                select(WatchlistTerm).where(WatchlistTerm.watchlist_id == watchlist.id)
            )
        )
        .scalars()
        .all()
    )
    query_terms = [
        QueryTerm(
            text=t.term,
            term_type=str(t.term_type),
            lang=t.lang,
            is_exclusion=t.is_exclusion,
            weight=t.weight,
        )
        for t in terms
    ]
    return WatchlistQuery(
        watchlist_id=watchlist.id,
        name=watchlist.name,
        terms=query_terms,
        lang_filter=watchlist.lang_filter,
        country_filter=watchlist.country_filter,
    )


async def _get_watchlist(session: AsyncSession, name_or_id: str) -> Watchlist:
    try:
        wl_id = uuid.UUID(name_or_id)
        stmt = select(Watchlist).where(Watchlist.id == wl_id)
    except ValueError:
        stmt = select(Watchlist).where(Watchlist.name == name_or_id)
    watchlist = (await session.execute(stmt)).scalar_one_or_none()
    if watchlist is None:
        raise LookupError(f"watchlist not found: {name_or_id}")
    return watchlist


async def _build_plans(
    session: AsyncSession,
    raws: Sequence[RawDocument],
    compiled: matcher.CompiledMatcher,
    source_type: str,
) -> tuple[list[_Plan], int, int]:
    """Normalise, match and assign dedup relationships. Returns (plans, errors, exact_dups)."""

    sources = _SourceCache(session)
    errors = 0
    seen_hashes: set[str] = set()
    exact_dups = 0
    # canonical docs discovered within this batch: (url_hash, unsigned_simhash, published_at)
    batch_canonicals: list[tuple[str, int, dt.datetime | None]] = []
    plans: list[_Plan] = []

    # Process earliest-first so the earliest document in a cluster becomes canonical.
    ordered = sorted(raws, key=lambda r: r.published_at or dt.datetime.max.replace(tzinfo=dt.UTC))

    for raw in ordered:
        try:
            source_id, content_rights = await sources.resolve(raw.source_domain, source_type)
            # SimHash / matching always use the full normalised text; the
            # content-rights cap is applied only to what is persisted.
            norm = normalize_document(raw, allows_fulltext_storage=(content_rights == "full_ok"))

            if norm.url_hash in seen_hashes:
                exact_dups += 1
                continue
            seen_hashes.add(norm.url_hash)

            sh = dedup.simhash64(norm.dedup_text())
            match_result = compiled.match(norm.match_text(), norm.lang)

            plan = _Plan(
                normalized=norm,
                source_id=source_id,
                content_rights=content_rights,
                simhash_unsigned=sh,
                match=match_result,
            )

            existing = await dedup.find_duplicate_canonical(session, sh, norm.published_at)
            if existing is not None:
                plan.dedup_existing = existing
            else:
                for cand_hash, cand_sh, cand_time in batch_canonicals:
                    if dedup.is_near_duplicate(sh, norm.published_at, cand_sh, cand_time):
                        plan.dedup_batch_hash = cand_hash
                        break
                else:
                    batch_canonicals.append((norm.url_hash, sh, norm.published_at))

            plans.append(plan)
        except Exception as exc:  # noqa: BLE001 - one poison doc must not stall the batch
            errors += 1
            log.warning("pipeline.document_failed", url=getattr(raw, "url", None), error=str(exc))

    return plans, errors, exact_dups


def _document_row(plan: _Plan, dedup_of: uuid.UUID | None) -> dict[str, Any]:
    n = plan.normalized
    body, summary = storage_for_rights(n, plan.content_rights)
    return {
        "source_id": plan.source_id,
        "external_id": n.external_id,
        "url": n.url,
        "canonical_url": n.canonical_url,
        "url_hash": n.url_hash,
        "simhash": dedup.to_signed64(plan.simhash_unsigned),
        "title": n.title,
        "body": body,
        "summary": summary,
        "lang": n.lang,
        "published_at": n.published_at,
        "fetched_at": dt.datetime.now(dt.UTC),
        "author": n.author,
        "media_type": n.media_type,
        "engagement": n.engagement,
        "raw": n.raw,
        "dedup_of": dedup_of,
    }


async def _insert_documents(
    session: AsyncSession, rows: list[dict[str, Any]]
) -> tuple[dict[str, uuid.UUID], set[str]]:
    """Batch-upsert document rows.

    Returns a ``url_hash -> id`` map covering every row and the set of hashes
    that were *genuinely* inserted (returned by ``RETURNING``; conflicts are not).
    """

    hash_to_id: dict[str, uuid.UUID] = {}
    newly_inserted: set[str] = set()
    if not rows:
        return hash_to_id, newly_inserted
    for start in range(0, len(rows), INSERT_BATCH_SIZE):
        chunk = rows[start : start + INSERT_BATCH_SIZE]
        stmt = (
            pg_insert(Document)
            .values(chunk)
            .on_conflict_do_nothing(index_elements=["url_hash"])
            .returning(Document.id, Document.url_hash)
        )
        for row_id, row_hash in (await session.execute(stmt)).all():
            hash_to_id[row_hash] = row_id
            newly_inserted.add(row_hash)
    # Fill in ids for rows that conflicted (already existed).
    missing = [r["url_hash"] for r in rows if r["url_hash"] not in hash_to_id]
    if missing:
        existing = await session.execute(
            select(Document.url_hash, Document.id).where(Document.url_hash.in_(missing))
        )
        for row_hash, row_id in existing.all():
            hash_to_id[row_hash] = row_id
    return hash_to_id, newly_inserted


async def _persist(session: AsyncSession, plans: list[_Plan], watchlist_id: uuid.UUID) -> set[str]:
    """Insert documents (two waves for intra-batch dedup) and matches.

    Returns the set of ``url_hash`` values that were genuinely inserted.
    """

    # Wave 0: canonicals and docs whose canonical already lives in the DB.
    wave0 = [p for p in plans if p.dedup_batch_hash is None]
    wave1 = [p for p in plans if p.dedup_batch_hash is not None]

    rows0 = [_document_row(p, p.dedup_existing) for p in wave0]
    hash_to_id, newly = await _insert_documents(session, rows0)
    for p in wave0:
        p.document_id = hash_to_id.get(p.normalized.url_hash)

    rows1 = [_document_row(p, hash_to_id.get(p.dedup_batch_hash or "")) for p in wave1]
    hash_to_id1, newly1 = await _insert_documents(session, rows1)
    hash_to_id.update(hash_to_id1)
    newly |= newly1
    for p in wave1:
        p.document_id = hash_to_id.get(p.normalized.url_hash)

    match_rows: list[dict[str, Any]] = [
        {
            "document_id": p.document_id,
            "watchlist_id": watchlist_id,
            "matched_terms": p.match.matched_terms,
            "match_score": p.match.score,
        }
        for p in plans
        if p.document_id is not None and p.match.matched
    ]
    for start in range(0, len(match_rows), INSERT_BATCH_SIZE):
        chunk = match_rows[start : start + INSERT_BATCH_SIZE]
        await session.execute(
            pg_insert(DocumentMatch)
            .values(chunk)
            .on_conflict_do_nothing(index_elements=["document_id", "watchlist_id"])
        )

    return newly


async def run_connector(
    connector: BaseConnector,
    query: WatchlistQuery,
    since: dt.datetime,
    *,
    max_docs: int = MAX_DOCS_PER_RUN,
) -> RunResult:
    """Run a single connector for one watchlist and persist its documents.

    Wraps everything in an ``ingestion_runs`` bookkeeping row. Exceptions from the
    connector are caught, recorded (status='error'), and never propagated.
    """

    started = time.monotonic()
    result = RunResult(connector=connector.name, watchlist_id=query.watchlist_id)
    factory = get_sessionmaker()

    async with factory() as session:
        run = IngestionRun(
            connector=connector.name,
            watchlist_id=query.watchlist_id,
            status="running",
            started_at=dt.datetime.now(dt.UTC),
        )
        session.add(run)
        await session.commit()
        run_id = run.id

    fetch_error: str | None = None
    raws: list[RawDocument] = []
    try:
        async for raw in connector.fetch(query, since):
            raws.append(raw)
            if len(raws) >= max_docs:
                break
    except Exception as exc:  # noqa: BLE001 - a failing connector must not abort others
        fetch_error = str(exc)
        log.warning("connector.fetch_failed", connector=connector.name, error=fetch_error)
    finally:
        with contextlib.suppress(Exception):
            await connector.aclose()

    result.fetched = len(raws)

    if fetch_error is None:
        try:
            compiled = matcher.compile_watchlist(query.terms)
            async with factory() as session:
                plans, errors, exact_dups = await _build_plans(
                    session, raws, compiled, str(connector.source_type)
                )
                newly = await _persist(session, plans, query.watchlist_id)
                await session.commit()

            # Precise classification (no double counting):
            #   inserted        = genuinely new document rows
            #   near_dup_new    = inserted rows flagged as near-duplicates
            #   exact_existing  = plan hashes that already existed in the DB
            inserted = len(newly)
            near_dup_new = len(
                [
                    p
                    for p in plans
                    if p.normalized.url_hash in newly and (p.dedup_existing or p.dedup_batch_hash)
                ]
            )
            exact_existing = len([p for p in plans if p.normalized.url_hash not in newly])
            result.inserted = inserted
            result.duplicates = exact_dups + exact_existing + near_dup_new
            result.errors = errors
            result.status = "ok"
        except Exception as exc:  # noqa: BLE001
            fetch_error = str(exc)
            log.warning("pipeline.persist_failed", connector=connector.name, error=fetch_error)
            result.status = "error"
    else:
        result.status = "error"
        result.errors = 1

    result.duration_ms = int((time.monotonic() - started) * 1000)

    async with factory() as session:
        run_row = await session.get(IngestionRun, run_id)
        if run_row is not None:
            run_row.status = result.status
            run_row.fetched = result.fetched
            run_row.inserted = result.inserted
            run_row.duplicates = result.duplicates
            run_row.errors = result.errors
            run_row.finished_at = dt.datetime.now(dt.UTC)
            run_row.duration_ms = result.duration_ms
            if fetch_error:
                run_row.detail = {"error": fetch_error}
            await session.commit()

    log.info(
        "ingestion.run",
        connector=result.connector,
        watchlist=str(query.watchlist_id),
        fetched=result.fetched,
        inserted=result.inserted,
        duplicates=result.duplicates,
        errors=result.errors,
        status=result.status,
        duration_ms=result.duration_ms,
    )
    return result


async def ingest(
    watchlist: str,
    *,
    connectors: Sequence[BaseConnector] | None = None,
    connector_name: str | None = None,
    since: dt.datetime | None = None,
) -> list[RunResult]:
    """Run every (or one) connector for a watchlist and return per-connector results.

    ``connectors`` may be injected (tests use ``FakeConnector``); otherwise the
    enabled connectors from the registry are used.
    """

    from newsradar.config import get_settings
    from newsradar.connectors.registry import (
        get_connector_by_name,
        get_enabled_connectors,
    )

    settings = get_settings()
    factory = get_sessionmaker()
    async with factory() as session:
        wl = await _get_watchlist(session, watchlist)
        query = await load_watchlist_query(session, wl)

    if connectors is None:
        if connector_name:
            one = get_connector_by_name(connector_name, settings)
            connectors = [one] if one is not None else []
        else:
            connectors = get_enabled_connectors(settings)

    if since is None:
        since = dt.datetime.now(dt.UTC) - DEFAULT_LOOKBACK

    results: list[RunResult] = []
    for connector in connectors:
        results.append(await run_connector(connector, query, since))
    return results
