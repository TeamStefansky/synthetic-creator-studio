"""Source diversity — the "50 docs from 40 outlets beats 50 from 3" signal.

``source_diversity`` is the normalised Shannon entropy of the event's document
distribution across distinct sources, where each document is weighted by its
source tier (tier-1 = 2.0 ... tier-4 = 0.5). A single dominant source gives ~0; an
even spread across many high-tier outlets gives ~1. This is what stops a
wire-story republished by one aggregation farm from looking like a real event.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.math import normalized_shannon_entropy

_SOURCE_COUNTS_SQL = text(
    """
    SELECT s.tier AS tier, count(*) AS c
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id
    JOIN sources s ON s.id = d.source_id
    WHERE ed.event_id = :event_id AND d.dedup_of IS NULL
    GROUP BY s.id, s.tier
    """
)


def diversity_from_counts(counts_by_source: list[tuple[int | None, int]]) -> float:
    """Tier-weighted normalised entropy from ``[(tier, doc_count), ...]`` per source."""

    weights = [w.tier_weight(tier) * count for tier, count in counts_by_source if count > 0]
    return normalized_shannon_entropy(weights)


async def source_diversity(session: AsyncSession, event_id: uuid.UUID) -> float:
    """Tier-weighted normalised Shannon entropy over the event's sources, in ``[0, 1]``."""

    rows = (await session.execute(_SOURCE_COUNTS_SQL, {"event_id": event_id})).all()
    return diversity_from_counts([(r.tier, int(r.c)) for r in rows])
