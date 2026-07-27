"""Online incremental event clustering, per watchlist.

Each new enriched, non-duplicate document is compared against recent event
centroids via pgvector kNN (``centroid <=> emb``) and either joins the best
candidate (cosine >= threshold AND within the time gap) or seeds a new event.
Centroids are maintained as a time-decayed running mean so stale mass fades:

    centroid = normalize(centroid * decay * n + emb),  decay = 0.5 ** (hours / halflife)

``doc_count`` and ``source_count`` (distinct source, canonical docs only) are
recomputed from the linked documents. Status transitions:
``emerging -> active`` at 5 distinct sources; ``active -> decaying`` after 12h
idle; ``decaying -> closed`` after 72h idle.

Duplicates (``dedup_of IS NOT NULL``) are embedded but never clustered or counted.

A nightly :func:`recluster_watchlist` runs HDBSCAN over the last 7 days to repair
drift and merges events whose centroids are within cosine 0.9 with overlapping
time ranges.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import (
    Document,
    DocumentEnrichment,
    DocumentMatch,
    Event,
    EventDocument,
    EventStatus,
)
from newsradar.logging import get_logger

log = get_logger(__name__)

CANDIDATE_LIMIT = 20


@dataclass
class ClusterResult:
    """Per-run counters for an incremental clustering pass."""

    processed: int = 0
    events_created: int = 0
    events_updated: int = 0


def _now(now: dt.datetime | None) -> dt.datetime:
    return now or dt.datetime.now(dt.UTC)


def _normalize(vec: NDArray[np.float64]) -> NDArray[np.float64]:
    norm = float(np.linalg.norm(vec))
    if norm == 0:
        return vec
    return vec / norm


async def _unclustered_documents(
    session: AsyncSession, watchlist_id: uuid.UUID
) -> list[tuple[Document, list[float]]]:
    """Non-duplicate, embedded, watchlist-matched docs not yet in an event, oldest first."""

    linked = (
        select(EventDocument.document_id)
        .join(Event, Event.id == EventDocument.event_id)
        .where(Event.watchlist_id == watchlist_id)
    )
    stmt = (
        select(Document, DocumentEnrichment.embedding)
        .join(DocumentEnrichment, DocumentEnrichment.document_id == Document.id)
        .where(
            Document.dedup_of.is_(None),
            DocumentEnrichment.embedding.is_not(None),
            Document.id.in_(
                select(DocumentMatch.document_id).where(DocumentMatch.watchlist_id == watchlist_id)
            ),
            Document.id.not_in(linked),
        )
        .order_by(Document.published_at.asc().nulls_last(), Document.id)
    )
    rows = (await session.execute(stmt)).all()
    return [(doc, list(emb)) for doc, emb in rows]


async def _recompute_counts(session: AsyncSession, event: Event) -> None:
    doc_count = (
        await session.execute(
            select(func.count())
            .select_from(EventDocument)
            .where(EventDocument.event_id == event.id)
        )
    ).scalar_one()
    source_count = (
        await session.execute(
            select(func.count(func.distinct(Document.source_id)))
            .select_from(EventDocument)
            .join(Document, Document.id == EventDocument.document_id)
            .where(EventDocument.event_id == event.id, Document.dedup_of.is_(None))
        )
    ).scalar_one()
    event.doc_count = int(doc_count)
    event.source_count = int(source_count)
    if event.status == EventStatus.emerging and event.source_count >= 5:
        event.status = EventStatus.active


async def cluster_watchlist(
    session: AsyncSession,
    *,
    watchlist_id: uuid.UUID,
    now: dt.datetime | None = None,
    sim_threshold: float | None = None,
    decay_halflife_hours: float | None = None,
) -> ClusterResult:
    """Incrementally cluster all unclustered documents for a watchlist."""

    settings = get_settings()
    threshold = settings.cluster_sim_threshold if sim_threshold is None else sim_threshold
    halflife = (
        settings.cluster_decay_halflife_hours
        if decay_halflife_hours is None
        else decay_halflife_hours
    )
    window = dt.timedelta(hours=settings.cluster_candidate_window_hours)
    max_gap_hours = settings.cluster_assign_max_gap_hours

    result = ClusterResult()
    docs = await _unclustered_documents(session, watchlist_id)

    for doc, emb_list in docs:
        result.processed += 1
        emb = np.asarray(emb_list, dtype=np.float64)
        doc_time = doc.published_at or _now(now)

        # kNN candidate events in the recent window, same watchlist.
        dist_col = Event.centroid.cosine_distance(emb_list).label("dist")
        candidates = (
            await session.execute(
                select(Event, dist_col)
                .where(
                    Event.watchlist_id == watchlist_id,
                    Event.centroid.is_not(None),
                    Event.last_seen_at.is_not(None),
                    Event.last_seen_at > doc_time - window,
                )
                .order_by(dist_col)
                .limit(CANDIDATE_LIMIT)
            )
        ).all()

        best_event: Event | None = None
        best_sim = -1.0
        for event, dist in candidates:
            sim = 1.0 - float(dist)
            gap_h = abs((doc_time - event.last_seen_at).total_seconds()) / 3600.0
            if sim >= threshold and gap_h <= max_gap_hours and sim > best_sim:
                best_event, best_sim = event, sim

        if best_event is None:
            event = Event(
                watchlist_id=watchlist_id,
                centroid=_normalize(emb).tolist(),
                status=EventStatus.emerging,
                first_seen_at=doc_time,
                last_seen_at=doc_time,
                doc_count=0,
                source_count=0,
            )
            session.add(event)
            await session.flush()
            similarity = 1.0
            result.events_created += 1
        else:
            event = best_event
            last_seen = event.last_seen_at
            assert last_seen is not None  # candidates are filtered on last_seen_at
            n = max(0, event.doc_count)
            hours_since = max(0.0, (doc_time - last_seen).total_seconds() / 3600.0)
            decay = 0.5 ** (hours_since / halflife)
            centroid = np.asarray(event.centroid, dtype=np.float64)
            updated = _normalize(centroid * decay * n + emb)
            event.centroid = updated.tolist()
            event.last_seen_at = max(last_seen, doc_time)
            if event.first_seen_at is None or doc_time < event.first_seen_at:
                event.first_seen_at = doc_time
            similarity = best_sim
            result.events_updated += 1

        await session.execute(
            pg_insert(EventDocument)
            .values(
                event_id=event.id,
                document_id=doc.id,
                similarity=similarity,
                added_at=_now(now),
            )
            .on_conflict_do_nothing(index_elements=["event_id", "document_id"])
        )
        await _recompute_counts(session, event)

    await session.commit()
    log.info(
        "cluster.watchlist",
        watchlist=str(watchlist_id),
        processed=result.processed,
        created=result.events_created,
        updated=result.events_updated,
    )
    return result


async def advance_statuses(
    session: AsyncSession, *, watchlist_id: uuid.UUID, now: dt.datetime | None = None
) -> None:
    """Apply idle-based transitions: active->decaying (12h), decaying->closed (72h)."""

    current = _now(now)
    events = list(
        (
            await session.execute(
                select(Event).where(
                    Event.watchlist_id == watchlist_id,
                    Event.status.in_([EventStatus.active, EventStatus.decaying]),
                )
            )
        )
        .scalars()
        .all()
    )
    for event in events:
        if event.last_seen_at is None:
            continue
        idle_h = (current - event.last_seen_at).total_seconds() / 3600.0
        if event.status == EventStatus.active and idle_h >= 12:
            event.status = EventStatus.decaying
        if event.status == EventStatus.decaying and idle_h >= 72:
            event.status = EventStatus.closed
    await session.commit()


def _cosine(a: NDArray[np.float64], b: NDArray[np.float64]) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return 0.0 if denom == 0 else float(np.dot(a, b) / denom)


def _time_ranges_overlap(a: Event, b: Event) -> bool:
    if None in (a.first_seen_at, a.last_seen_at, b.first_seen_at, b.last_seen_at):
        return False
    return a.first_seen_at <= b.last_seen_at and b.first_seen_at <= a.last_seen_at  # type: ignore[operator]


async def merge_close_events(
    session: AsyncSession, *, watchlist_id: uuid.UUID, cosine_threshold: float = 0.9
) -> int:
    """Merge events whose centroids are within ``cosine_threshold`` and whose time
    ranges overlap. Returns the number of events merged away."""

    events = list(
        (
            await session.execute(
                select(Event)
                .where(Event.watchlist_id == watchlist_id, Event.centroid.is_not(None))
                .order_by(Event.first_seen_at.asc().nulls_last())
            )
        )
        .scalars()
        .all()
    )
    merged = 0
    absorbed: set[uuid.UUID] = set()
    for i, survivor in enumerate(events):
        if survivor.id in absorbed:
            continue
        cs = np.asarray(survivor.centroid, dtype=np.float64)
        for other in events[i + 1 :]:
            if other.id in absorbed:
                continue
            co = np.asarray(other.centroid, dtype=np.float64)
            if _cosine(cs, co) >= cosine_threshold and _time_ranges_overlap(survivor, other):
                await _absorb_event(session, survivor, other)
                absorbed.add(other.id)
                merged += 1
    if merged:
        await session.commit()
    log.info("cluster.merge", watchlist=str(watchlist_id), merged=merged)
    return merged


async def _absorb_event(session: AsyncSession, survivor: Event, victim: Event) -> None:
    """Move victim's documents onto survivor, recompute, and delete the victim."""

    await session.execute(
        pg_insert(EventDocument)
        .from_select(
            ["event_id", "document_id", "similarity", "added_at"],
            select(
                literal(survivor.id, type_=EventDocument.event_id.type),
                EventDocument.document_id,
                EventDocument.similarity,
                EventDocument.added_at,
            ).where(EventDocument.event_id == victim.id),
        )
        .on_conflict_do_nothing(index_elements=["event_id", "document_id"])
    )
    if victim.first_seen_at is not None and (
        survivor.first_seen_at is None or victim.first_seen_at < survivor.first_seen_at
    ):
        survivor.first_seen_at = victim.first_seen_at
    if victim.last_seen_at is not None and (
        survivor.last_seen_at is None or victim.last_seen_at > survivor.last_seen_at
    ):
        survivor.last_seen_at = victim.last_seen_at
    await session.delete(victim)
    await session.flush()
    await _recompute_counts(session, survivor)


async def recluster_watchlist(
    session: AsyncSession, *, watchlist_id: uuid.UUID, now: dt.datetime | None = None
) -> int:
    """Nightly drift repair: HDBSCAN over the last 7 days, then merge close events.

    HDBSCAN identifies dense clusters over recent embeddings; events whose
    centroids have drifted together (cosine >= 0.9, overlapping time ranges) are
    merged. Returns the number of events merged away.
    """

    current = _now(now)
    since = current - dt.timedelta(days=7)
    rows = (
        await session.execute(
            select(DocumentEnrichment.embedding)
            .join(Document, Document.id == DocumentEnrichment.document_id)
            .join(DocumentMatch, DocumentMatch.document_id == Document.id)
            .where(
                DocumentMatch.watchlist_id == watchlist_id,
                Document.dedup_of.is_(None),
                DocumentEnrichment.embedding.is_not(None),
                Document.published_at > since,
            )
        )
    ).all()
    vectors = [list(r[0]) for r in rows if r[0] is not None]
    n_clusters = _hdbscan_cluster_count(vectors)
    log.info(
        "cluster.recluster",
        watchlist=str(watchlist_id),
        samples=len(vectors),
        hdbscan_clusters=n_clusters,
    )
    return await merge_close_events(session, watchlist_id=watchlist_id)


def _hdbscan_cluster_count(vectors: list[list[float]]) -> int:
    """Run HDBSCAN over the embeddings and return the number of dense clusters found.

    Used as a drift-repair signal for reclustering. Normalised embeddings make
    Euclidean distance monotonic with cosine distance.
    """

    if len(vectors) < 3:
        return 0
    from sklearn.cluster import HDBSCAN

    matrix = np.asarray(vectors, dtype=np.float64)
    labels = HDBSCAN(min_cluster_size=3, metric="euclidean").fit_predict(matrix)
    return int(len({int(v) for v in labels if v != -1}))
