"""Per-event hourly velocity and acceleration, plus false-positive-safe spikes.

The hourly bucketing is SQL-first: Postgres ``generate_series`` builds a dense
hourly axis (so empty hours are real zeros, not gaps) and a ``LEFT JOIN`` counts
documents per hour. Python only does the final z-score arithmetic over the dense
series — it never pulls raw documents in to count them.

* ``velocity`` = documents published in the bucket's hour.
* ``acceleration`` = z-score of the bucket's count against the event's own
  trailing 24h mean/stdev (Welford), emitted only once at least
  :data:`~newsradar.signals.weights.ACCEL_MIN_BUCKETS` trailing buckets exist;
  before that it is ``None``.

A **spike** requires three independent conditions to all hold (see
:func:`detect_spikes`) — this is what keeps the no-false-positive gate honest.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.math import welford_stats, zscore


@dataclass(frozen=True)
class HourBucket:
    """One dense hourly bucket for an event's timeline."""

    bucket_at: dt.datetime
    doc_count: int
    velocity: float
    acceleration: float | None


_SERIES_SQL = text(
    """
    WITH bounds AS (
        SELECT date_trunc('hour', min(coalesce(d.published_at, d.fetched_at))) AS start_h
        FROM event_documents ed
        JOIN documents d ON d.id = ed.document_id
        WHERE ed.event_id = :event_id AND d.dedup_of IS NULL
    ),
    series AS (
        SELECT generate_series(
            b.start_h,
            date_trunc('hour', CAST(:now AS timestamptz)),
            interval '1 hour'
        ) AS bucket_at
        FROM bounds b
        WHERE b.start_h IS NOT NULL
    ),
    counts AS (
        SELECT
            date_trunc('hour', coalesce(d.published_at, d.fetched_at)) AS bucket_at,
            count(*) AS c
        FROM event_documents ed
        JOIN documents d ON d.id = ed.document_id
        WHERE ed.event_id = :event_id
          AND d.dedup_of IS NULL
          AND coalesce(d.published_at, d.fetched_at) <= CAST(:now AS timestamptz)
        GROUP BY 1
    )
    SELECT s.bucket_at, coalesce(c.c, 0) AS doc_count
    FROM series s
    LEFT JOIN counts c ON c.bucket_at = s.bucket_at
    WHERE s.bucket_at <= date_trunc('hour', CAST(:now AS timestamptz))
    ORDER BY s.bucket_at
    """
)


def _acceleration_for(index: int, counts: Sequence[int]) -> float | None:
    """Trailing-window z-score for ``counts[index]`` or ``None`` if too few buckets."""

    lo = max(0, index - w.ACCEL_TRAILING_BUCKETS)
    trailing = counts[lo:index]
    if len(trailing) < w.ACCEL_MIN_BUCKETS:
        return None
    _n, mean, stdev = welford_stats(float(c) for c in trailing)
    return zscore(float(counts[index]), mean, stdev, stdev_floor=w.ACCEL_STDEV_FLOOR)


def buckets_from_counts(
    bucket_times: Sequence[dt.datetime], counts: Sequence[int]
) -> list[HourBucket]:
    """Assemble :class:`HourBucket` rows (with acceleration) from a dense series.

    Pure function — the unit tests drive it directly with a synthetic timeline.
    """

    out: list[HourBucket] = []
    for i, (bucket_at, count) in enumerate(zip(bucket_times, counts, strict=True)):
        out.append(
            HourBucket(
                bucket_at=bucket_at,
                doc_count=count,
                velocity=float(count),
                acceleration=_acceleration_for(i, counts),
            )
        )
    return out


async def event_hourly_series(
    session: AsyncSession, event_id: uuid.UUID, *, now: dt.datetime
) -> list[HourBucket]:
    """Dense hourly velocity/acceleration series for one event up to ``now``."""

    rows = (await session.execute(_SERIES_SQL, {"event_id": event_id, "now": now})).all()
    if not rows:
        return []
    times = [r.bucket_at for r in rows]
    counts = [int(r.doc_count) for r in rows]
    return buckets_from_counts(times, counts)


def latest_bucket(series: Sequence[HourBucket]) -> HourBucket | None:
    """The most recent bucket, or ``None`` for an empty series."""

    return series[-1] if series else None


def detect_spikes(
    series: Sequence[HourBucket],
    *,
    expected_at: Callable[[dt.datetime], float] | None = None,
) -> list[HourBucket]:
    """Return the buckets that qualify as spikes — designed for zero false positives.

    A bucket is a spike only when **all three** hold:

    1. ``acceleration >= SPIKE_Z`` — a genuine statistical jump versus the event's
       own recent history (with a stdev floor, so tiny-variance windows cannot
       manufacture huge z-scores);
    2. ``doc_count >= SPIKE_MIN_COUNT`` — an absolute-volume floor, so a 0->1 or
       1->2 blip on a quiet event is never a spike;
    3. ``doc_count >= SPIKE_BASELINE_FACTOR * seasonal_expected`` — the count beats
       what is *normal for this hour-of-week* (via ``expected_at``), so a busy hour
       that is ordinary for its slot (e.g. a routine weekday morning) does not fire.

    ``expected_at`` is the per-watchlist seasonal baseline
    (:class:`~newsradar.signals.baseline.SeasonalBaseline`); when omitted the
    seasonal condition is treated as satisfied (still gated by 1 and 2).
    """

    spikes: list[HourBucket] = []
    for b in series:
        if b.acceleration is None or b.acceleration < w.SPIKE_Z:
            continue
        if b.doc_count < w.SPIKE_MIN_COUNT:
            continue
        if expected_at is not None:
            expected = expected_at(b.bucket_at)
            if b.doc_count < w.SPIKE_BASELINE_FACTOR * max(expected, 1.0):
                continue
        spikes.append(b)
    return spikes
