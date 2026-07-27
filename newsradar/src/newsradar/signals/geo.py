"""Geographic hot zones — H3 (resolution 4) and country aggregation.

A zone is "hot" when its document count in the trailing 6 hours exceeds 3σ over
its own trailing 14-day mean (measured in aligned 6-hour windows). H3 indexing is
done in Python (Postgres has no H3), but only lightweight rows — lat/lon, country,
timestamp, event id — are pulled in, never document bodies.

Output per hot zone: ``{h3, country_code, lat, lon, doc_count, z, top_event_ids}``.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.math import zscore


@dataclass(frozen=True)
class GeoDoc:
    """A geolocated document: the only fields hot-zone detection needs."""

    lat: float
    lon: float
    country_code: str | None
    published_at: dt.datetime
    event_id: uuid.UUID | None


@dataclass(frozen=True)
class HotZone:
    """A geographic zone whose recent volume is anomalously high."""

    h3: str
    country_code: str | None
    lat: float
    lon: float
    doc_count: int
    z: float
    top_event_ids: list[uuid.UUID]


def _window_index(ts: dt.datetime, now: dt.datetime) -> int:
    """0 for the trailing 6h window, 1 for the one before it, and so on."""

    delta_h = (now - ts).total_seconds() / 3600.0
    return int(delta_h // w.GEO_WINDOW_HOURS)


def compute_hot_zones(docs: Sequence[GeoDoc], *, now: dt.datetime) -> list[HotZone]:
    """Detect hot H3 zones from geolocated documents (pure)."""

    n_windows = (w.GEO_BASELINE_DAYS * 24) // w.GEO_WINDOW_HOURS
    by_cell: dict[str, list[GeoDoc]] = defaultdict(list)
    for d in docs:
        cell = h3.latlng_to_cell(d.lat, d.lon, w.H3_RESOLUTION)
        by_cell[cell].append(d)

    hot: list[HotZone] = []
    for cell, cell_docs in by_cell.items():
        window_counts = [0] * n_windows
        current_docs: list[GeoDoc] = []
        for d in cell_docs:
            idx = _window_index(d.published_at, now)
            if idx < 0 or idx >= n_windows:
                continue
            window_counts[idx] += 1
            if idx == 0:
                current_docs.append(d)
        current = window_counts[0]
        if current < w.GEO_HOT_MIN_COUNT:
            continue
        baseline = window_counts[1:]  # trailing history, excluding the current window
        mean = sum(baseline) / len(baseline) if baseline else 0.0
        var = (
            sum((c - mean) ** 2 for c in baseline) / (len(baseline) - 1)
            if len(baseline) > 1
            else 0.0
        )
        z = zscore(float(current), mean, var**0.5, stdev_floor=1.0)
        if z < w.GEO_HOT_Z:
            continue
        lat, lon = h3.cell_to_latlng(cell)
        countries = Counter(d.country_code for d in current_docs if d.country_code)
        events = Counter(d.event_id for d in current_docs if d.event_id is not None)
        hot.append(
            HotZone(
                h3=cell,
                country_code=countries.most_common(1)[0][0] if countries else None,
                lat=lat,
                lon=lon,
                doc_count=current,
                z=round(z, 2),
                top_event_ids=[eid for eid, _ in events.most_common(3)],
            )
        )
    hot.sort(key=lambda hz: (hz.z, hz.doc_count), reverse=True)
    return hot


def country_counts(docs: Sequence[GeoDoc], *, now: dt.datetime) -> dict[str, int]:
    """Trailing-6h document counts per country code (for the report geo section)."""

    counts: Counter[str] = Counter()
    for d in docs:
        if d.country_code and _window_index(d.published_at, now) == 0:
            counts[d.country_code] += 1
    return dict(counts)


_GEO_SQL = text(
    """
    SELECT
        (de.geo ->> 'lat')::float AS lat,
        (de.geo ->> 'lon')::float AS lon,
        (de.geo ->> 'country_code') AS country_code,
        coalesce(d.published_at, d.fetched_at) AS published_at,
        ed.event_id AS event_id
    FROM documents d
    JOIN document_matches m ON m.document_id = d.id
    JOIN document_enrichment de ON de.document_id = d.id
    LEFT JOIN event_documents ed ON ed.document_id = d.id
    WHERE m.watchlist_id = :watchlist_id
      AND d.dedup_of IS NULL
      AND de.geo IS NOT NULL
      AND de.geo ? 'lat' AND de.geo ? 'lon'
      AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
      AND coalesce(d.published_at, d.fetched_at) <= CAST(:now AS timestamptz)
    """
)


async def _geo_docs(
    session: AsyncSession, watchlist_id: uuid.UUID, *, now: dt.datetime
) -> list[GeoDoc]:
    start_at = now - dt.timedelta(days=w.GEO_BASELINE_DAYS)
    rows = (
        await session.execute(
            _GEO_SQL, {"watchlist_id": watchlist_id, "now": now, "start_at": start_at}
        )
    ).all()
    return [
        GeoDoc(
            lat=r.lat,
            lon=r.lon,
            country_code=r.country_code,
            published_at=r.published_at,
            event_id=r.event_id,
        )
        for r in rows
        if r.lat is not None and r.lon is not None
    ]


async def hot_zones(
    session: AsyncSession, watchlist_id: uuid.UUID, *, now: dt.datetime
) -> list[HotZone]:
    """Detect hot H3 zones for a watchlist as of ``now``."""

    return compute_hot_zones(await _geo_docs(session, watchlist_id, now=now), now=now)


async def geo_country_counts(
    session: AsyncSession, watchlist_id: uuid.UUID, *, now: dt.datetime
) -> dict[str, int]:
    """Trailing-6h document counts per country for a watchlist."""

    return country_counts(await _geo_docs(session, watchlist_id, now=now), now=now)
