"""Shared story helpers: the deterministic representative-document choice (P6).

The representative document is the one whose article a story links to and whose
translated title/extract become the story's headline. Edition build (for
translation) and the serializer (for display) MUST agree on it, so both call this
one helper. The pick is deterministic: best source tier, then earliest publish
time, then document id.
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Sequence

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_REP_SQL = text(
    """
    SELECT ed.event_id AS event_id, ed.document_id AS document_id,
           s.tier AS tier, coalesce(d.published_at, d.fetched_at) AS ts
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id
    JOIN sources s ON s.id = d.source_id
    WHERE ed.event_id = ANY(:event_ids)
    """
)


async def representative_ids(
    session: AsyncSession, event_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """Return ``{event_id: representative_document_id}`` for the given events."""

    out: dict[uuid.UUID, tuple[int, float, str, uuid.UUID]] = {}
    ids = list(dict.fromkeys(event_ids))
    if not ids:
        return {}
    for r in (await session.execute(_REP_SQL, {"event_ids": ids})).all():
        tier = r.tier if r.tier is not None else 99
        ts = -r.ts.timestamp() if r.ts is not None else math.inf
        key = (tier, ts, str(r.document_id), r.document_id)
        cur = out.get(r.event_id)
        if cur is None or key[:3] < cur[:3]:
            out[r.event_id] = key
    return {eid: v[3] for eid, v in out.items()}
