"""Entity-targeted negativity — NOT the document's overall sentiment.

The load-bearing domain rule (see ``CLAUDE.md``): an article about a terror
attack scores negative *overall* yet may be *favorable* toward the monitored
entity. Negativity here is therefore computed strictly from entity-targeted
``stance_assessments`` — never from ``document_enrichment.sentiment_overall`` — and
only over documents whose stance toward the entity is negative
(``stance < 0``). A favorable stance in a grim story contributes nothing.

For an entity (or the event aggregate)::

    negativity_index = clamp01(
        Σ_{stance<0} (−stance/2) · confidence · prominence · tier_weight
        ─────────────────────────────────────────────────────────────────
        Σ_{stance<0}            confidence · prominence · tier_weight
    )

i.e. the weighted mean *intensity* of the negative coverage (stance −1 → 0.5,
stance −2 → 1.0). Prevalence is reported separately as ``negative_reach_share`` =
negative weighted coverage / total weighted coverage. Opinion pieces
(``is_opinion``) are tallied in their own bucket and never blended into the main
figure.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w


@dataclass(frozen=True)
class NegRow:
    """One (document, entity) stance row with the weights that scale it."""

    entity_id: uuid.UUID
    entity_name: str
    is_primary: bool
    stance: int
    confidence: float | None
    prominence: float | None
    is_opinion: bool
    tier: int | None

    @property
    def weight(self) -> float:
        conf = self.confidence if self.confidence is not None else w.NEG_DEFAULT_CONFIDENCE
        prom = self.prominence if self.prominence is not None else w.NEG_DEFAULT_PROMINENCE
        return conf * prom * w.tier_weight(self.tier)


@dataclass(frozen=True)
class NegativityBucket:
    """Negativity metrics for one set of rows (a main or opinion bucket)."""

    negativity_index: float
    negative_doc_count: int
    negative_reach_share: float
    total_doc_count: int


@dataclass(frozen=True)
class EntityNegativity:
    """Per-entity negativity, main coverage and opinion kept apart."""

    entity_id: uuid.UUID
    entity_name: str
    is_primary: bool
    main: NegativityBucket
    opinion: NegativityBucket


@dataclass(frozen=True)
class EventNegativity:
    """Event-level negativity: aggregate plus a per-entity breakdown."""

    aggregate: NegativityBucket
    aggregate_opinion: NegativityBucket
    by_entity: list[EntityNegativity]

    def for_entity(self, entity_id: uuid.UUID) -> EntityNegativity | None:
        for e in self.by_entity:
            if e.entity_id == entity_id:
                return e
        return None


def _bucket(rows: Sequence[NegRow]) -> NegativityBucket:
    total_weight = sum(r.weight for r in rows)
    negatives = [r for r in rows if r.stance < 0]
    neg_weight = sum(r.weight for r in negatives)
    if neg_weight > 0.0:
        numerator = sum((-r.stance / 2.0) * r.weight for r in negatives)
        index = min(1.0, max(0.0, numerator / neg_weight))
    else:
        index = 0.0
    reach = neg_weight / total_weight if total_weight > 0.0 else 0.0
    return NegativityBucket(
        negativity_index=index,
        negative_doc_count=len(negatives),
        negative_reach_share=reach,
        total_doc_count=len(rows),
    )


def compute_negativity(rows: Sequence[NegRow]) -> EventNegativity:
    """Pure computation of :class:`EventNegativity` from stance rows."""

    main_all = [r for r in rows if not r.is_opinion]
    opinion_all = [r for r in rows if r.is_opinion]

    by_entity_ids: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for r in rows:
        if r.entity_id not in seen:
            seen.add(r.entity_id)
            by_entity_ids.append(r.entity_id)

    by_entity: list[EntityNegativity] = []
    for eid in by_entity_ids:
        e_rows = [r for r in rows if r.entity_id == eid]
        sample = e_rows[0]
        by_entity.append(
            EntityNegativity(
                entity_id=eid,
                entity_name=sample.entity_name,
                is_primary=sample.is_primary,
                main=_bucket([r for r in e_rows if not r.is_opinion]),
                opinion=_bucket([r for r in e_rows if r.is_opinion]),
            )
        )

    return EventNegativity(
        aggregate=_bucket(main_all),
        aggregate_opinion=_bucket(opinion_all),
        by_entity=by_entity,
    )


_NEG_SQL = text(
    """
    SELECT
        st.entity_id AS entity_id,
        we.name AS entity_name,
        we.is_primary AS is_primary,
        st.stance AS stance,
        st.confidence AS confidence,
        de.prominence AS prominence,
        coalesce(de.is_opinion, false) AS is_opinion,
        s.tier AS tier
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id AND d.dedup_of IS NULL
    JOIN stance_assessments st ON st.document_id = d.id
    JOIN watchlist_entities we ON we.id = st.entity_id
    JOIN sources s ON s.id = d.source_id
    LEFT JOIN document_enrichment de ON de.document_id = d.id
    WHERE ed.event_id = :event_id
      AND (
        CAST(:since AS timestamptz) IS NULL
        OR coalesce(d.published_at, d.fetched_at) >= CAST(:since AS timestamptz)
      )
    """
)


async def event_negativity(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    since: dt.datetime | None = None,
) -> EventNegativity:
    """Compute entity-targeted negativity for an event (optionally within a window)."""

    rows = (await session.execute(_NEG_SQL, {"event_id": event_id, "since": since})).all()
    neg_rows = [
        NegRow(
            entity_id=r.entity_id,
            entity_name=r.entity_name,
            is_primary=bool(r.is_primary),
            stance=int(r.stance),
            confidence=r.confidence,
            prominence=r.prominence,
            is_opinion=bool(r.is_opinion),
            tier=r.tier,
        )
        for r in rows
    ]
    return compute_negativity(neg_rows)
