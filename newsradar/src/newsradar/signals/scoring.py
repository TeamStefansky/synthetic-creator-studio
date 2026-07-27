"""Composite heat score (0-100) and its two remaining components.

``heat`` combines five normalised components with the hand-set weights in
:mod:`newsradar.signals.weights`::

    heat = 100 * sigmoid( GAIN * (Σ w_i·norm(component_i) − CENTER) )

The spec writes ``100 * sigmoid(Σ w_i·norm(...))``. A bare logistic of a weighted
sum that can only reach 1.0 saturates at ``sigmoid(1) ≈ 0.73`` — the 85-point
"critical" threshold would then be *unreachable* and every quiet event would still
score ~50. We therefore apply a documented gain/centre (``HEAT_SIGMOID_GAIN`` /
``HEAT_SIGMOID_CENTER``) so the score spans a usable 0-100 and the 70/85 alert
thresholds are reachable. This is the one deliberate deviation from the literal
formula; the weights themselves are unchanged and still live in one place.

``source_diversity``, ``velocity`` and ``acceleration`` come from their own
modules; this module owns ``cross_platform_lift`` and ``tier1_share`` and the
final arithmetic.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.math import clamp, norm_linear, sigmoid


@dataclass(frozen=True)
class HeatComponents:
    """The five inputs to the composite heat score (raw, pre-normalisation)."""

    acceleration: float | None  # z-score (may be None before warm-up)
    source_diversity: float  # already 0-1
    velocity: float  # documents/hour
    cross_platform_lift: float  # already 0-1
    tier1_share: float  # already 0-1


def compute_heat(c: HeatComponents) -> float:
    """Composite heat score in ``[0, 100]`` from :class:`HeatComponents`."""

    accel_norm = norm_linear(max(c.acceleration or 0.0, 0.0), w.ACCEL_NORM_DENOM)
    velocity_norm = norm_linear(c.velocity, w.VELOCITY_NORM_DENOM)
    weighted = (
        w.HEAT_WEIGHTS["acceleration"] * accel_norm
        + w.HEAT_WEIGHTS["source_diversity"] * clamp(c.source_diversity)
        + w.HEAT_WEIGHTS["velocity"] * velocity_norm
        + w.HEAT_WEIGHTS["cross_platform_lift"] * clamp(c.cross_platform_lift)
        + w.HEAT_WEIGHTS["tier1_share"] * clamp(c.tier1_share)
    )
    heat = 100.0 * sigmoid(w.HEAT_SIGMOID_GAIN * (weighted - w.HEAT_SIGMOID_CENTER))
    return round(heat, 2)


# --------------------------------------------------------------------------------------
# cross_platform_lift
# --------------------------------------------------------------------------------------


def compute_cross_platform_lift(events: Sequence[tuple[str, dt.datetime]]) -> float:
    """Cross-platform lift from ``[(source_type, published_at), ...]``.

    1.0 when documents from >=2 distinct ``source_type`` values appear within
    :data:`~newsradar.signals.weights.CROSS_PLATFORM_WINDOW_HOURS` of each other,
    scaled by how quickly the crossover happened (a simultaneous crossover scores
    1.0, one at the edge of the window ~0.0). 0.0 if the story never crossed
    platforms within the window.
    """

    ordered = sorted(events, key=lambda e: e[1])
    window = w.CROSS_PLATFORM_WINDOW_HOURS
    best = 0.0
    # Track the earliest time each *other* source_type was seen; for each doc find
    # the smallest gap to a doc of a different type within the window.
    for i, (stype_i, ts_i) in enumerate(ordered):
        for stype_j, ts_j in ordered[i + 1 :]:
            if stype_j == stype_i:
                continue
            gap_h = abs((ts_j - ts_i).total_seconds()) / 3600.0
            if gap_h > window:
                break  # ordered by time; further js only widen the gap
            best = max(best, 1.0 - gap_h / window)
    return clamp(best)


def compute_tier1_share(counts_by_tier: Sequence[tuple[int | None, int]]) -> float:
    """Tier-weighted share of coverage from tier-1 sources, in ``[0, 1]``."""

    total = 0.0
    tier1 = 0.0
    for tier, count in counts_by_tier:
        mass = w.tier_weight(tier) * count
        total += mass
        if tier == 1:
            tier1 += mass
    return tier1 / total if total > 0.0 else 0.0


_CROSS_SQL = text(
    """
    SELECT s.source_type::text AS source_type,
           coalesce(d.published_at, d.fetched_at) AS ts
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id AND d.dedup_of IS NULL
    JOIN sources s ON s.id = d.source_id
    WHERE ed.event_id = :event_id AND coalesce(d.published_at, d.fetched_at) IS NOT NULL
    ORDER BY ts
    """
)

_TIER_SQL = text(
    """
    SELECT s.tier AS tier, count(*) AS c
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id AND d.dedup_of IS NULL
    JOIN sources s ON s.id = d.source_id
    WHERE ed.event_id = :event_id
    GROUP BY s.tier
    """
)


async def cross_platform_lift(session: AsyncSession, event_id: uuid.UUID) -> float:
    """Cross-platform lift for an event (see :func:`compute_cross_platform_lift`)."""

    rows = (await session.execute(_CROSS_SQL, {"event_id": event_id})).all()
    return compute_cross_platform_lift([(r.source_type, r.ts) for r in rows])


async def tier1_share(session: AsyncSession, event_id: uuid.UUID) -> float:
    """Tier-1 weighted coverage share for an event (see :func:`compute_tier1_share`)."""

    rows = (await session.execute(_TIER_SQL, {"event_id": event_id})).all()
    return compute_tier1_share([(r.tier, int(r.c)) for r in rows])


async def has_tier1_source(session: AsyncSession, event_id: uuid.UUID) -> bool:
    """Whether the event currently has at least one tier-1 source (for tier1_pickup)."""

    return await tier1_share(session, event_id) > 0.0


_HAS_TIER1_ASOF_SQL = text(
    """
    SELECT EXISTS (
        SELECT 1
        FROM event_documents ed
        JOIN documents d ON d.id = ed.document_id AND d.dedup_of IS NULL
        JOIN sources s ON s.id = d.source_id
        WHERE ed.event_id = :event_id
          AND s.tier = 1
          AND coalesce(d.published_at, d.fetched_at) <= CAST(:asof AS timestamptz)
    ) AS has_t1
    """
)


async def has_tier1_source_asof(
    session: AsyncSession, event_id: uuid.UUID, asof: dt.datetime
) -> bool:
    """Whether the event had a tier-1 source as of ``asof`` (for tier1_pickup crossing)."""

    return bool(
        (
            await session.execute(_HAS_TIER1_ASOF_SQL, {"event_id": event_id, "asof": asof})
        ).scalar_one()
    )
