"""Full Coverage (P8): break one event's coverage into angles + facets.

Google-News-style "Full Coverage" for a story. Given an event, this groups its
(deduplicated) member documents into **angles** — framing sub-clusters found by
document-embedding similarity — and adds two facets: a **by-country** outlet
breakdown and an **entity-targeted stance** summary.

Design constraints honored:
- **No extra LLM cost.** Angles reuse the embeddings already computed in the
  pipeline; grouping is deterministic connected-components over the cosine
  similarity graph (identical input → identical angles). Angle labels are the
  representative document's translated headline (falling back to the original
  title) — never a generated phrase.
- **Attribution + rights.** Every outlet carries its name + original url only; no
  body text is emitted. Angle labels are headlines (titles are shown at every
  content-rights tier).
- **Honest, never inferred.** Stance counts come from stored ``stance_assessments``
  only; a document with no stance row is ``unassessed`` (never guessed). When the
  event has no stance data at all, ``stance.assessed`` is False. A story with
  fewer than two sources has no full-coverage breakdown (returns ``None``).
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections import defaultdict
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.schemas import (
    CountryCoverageOut,
    CoverageAngleOut,
    CoverageItemOut,
    FullCoverageOut,
    StanceSummaryOut,
)
from newsradar.config import get_settings
from newsradar.db.models import Event, Translation, TranslationField

# One row per deduplicated document in the event, with attribution + embedding.
_DOCS_SQL = text(
    """
    SELECT d.id AS document_id, s.name AS source_name, s.domain AS source_domain,
           d.url AS url, coalesce(d.published_at, d.fetched_at) AS published_at,
           s.country_code AS source_country, d.title AS title,
           de.embedding AS embedding
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id
    JOIN sources s ON s.id = d.source_id
    LEFT JOIN document_enrichment de ON de.document_id = d.id
    WHERE ed.event_id = :event_id AND d.dedup_of IS NULL
    ORDER BY coalesce(d.published_at, d.fetched_at) ASC NULLS LAST, d.id
    """
)

# Stance rows for the event's documents (entity-targeted; one row per doc+entity).
_STANCE_SQL = text(
    """
    SELECT sa.document_id AS document_id, sa.stance AS stance
    FROM stance_assessments sa
    JOIN event_documents ed ON ed.document_id = sa.document_id
    JOIN documents d ON d.id = sa.document_id
    WHERE ed.event_id = :event_id AND d.dedup_of IS NULL
    """
)


def _to_vec(raw: object) -> NDArray[np.float64] | None:
    """Coerce a pgvector value to a float array. A raw ``text()`` query returns the
    vector as its string form (``"[0,1,...]"``); the ORM returns a list. Handle
    both, and ``None``."""

    if raw is None:
        return None
    if isinstance(raw, str):
        s = raw.strip().lstrip("[").rstrip("]")
        if not s:
            return None
        return np.fromstring(s, sep=",", dtype=np.float64)
    return np.asarray(raw, dtype=np.float64)


@dataclass
class _Doc:
    document_id: uuid.UUID
    source_name: str
    source_domain: str | None
    url: str
    published_at: dt.datetime | None
    source_country: str | None
    title: str | None
    embedding: NDArray[np.float64] | None


def _connected_components(n: int, sims: list[list[float]], threshold: float) -> list[list[int]]:
    """Union-find over the i<j pairs whose cosine similarity ≥ threshold.

    Order-independent and deterministic: the groups depend only on the similarity
    matrix, not on iteration order. Documents without an embedding never link to
    anything (they land in their own singleton group).
    """

    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for i in range(n):
        for j in range(i + 1, n):
            if sims[i][j] >= threshold:
                union(i, j)

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)
    # Deterministic order: keep documents in their input (time-sorted) order within
    # each group, and order groups by their first member's input index.
    return [members for _, members in sorted(groups.items())]


def _cosine_matrix(docs: list[_Doc]) -> list[list[float]]:
    n = len(docs)
    sims = [[0.0] * n for _ in range(n)]
    norms: list[NDArray[np.float64] | None] = []
    for d in docs:
        if d.embedding is None:
            norms.append(None)
            continue
        v = d.embedding
        nrm = float(np.linalg.norm(v))
        norms.append(v / nrm if nrm else None)
    for i in range(n):
        a = norms[i]
        if a is None:
            continue
        for j in range(i + 1, n):
            b = norms[j]
            if b is None:
                continue
            s = float(np.dot(a, b))
            sims[i][j] = s
            sims[j][i] = s
    return sims


def _item(d: _Doc) -> CoverageItemOut:
    return CoverageItemOut(
        source_name=d.source_name or (d.source_domain or "unknown"),
        url=d.url,
        published_at=d.published_at,
        source_country=d.source_country,
    )


async def _angle_labels(
    session: AsyncSession,
    rep_ids: list[uuid.UUID],
    fallback: dict[uuid.UUID, str],
    target_lang: str,
) -> dict[uuid.UUID, str]:
    """Translated headline per representative document; falls back to the title."""

    labels = dict(fallback)
    if rep_ids:
        rows = (
            (
                await session.execute(
                    select(Translation).where(
                        Translation.document_id.in_(rep_ids),
                        Translation.target_lang == target_lang,
                        Translation.field == TranslationField.title,
                    )
                )
            )
            .scalars()
            .all()
        )
        for t in rows:
            if t.text:
                labels[t.document_id] = t.text
    return labels


async def build_full_coverage(
    session: AsyncSession, event_id: uuid.UUID, *, target_lang: str = "en"
) -> FullCoverageOut | None:
    """Build the Full Coverage breakdown for an event, or ``None`` if it does not
    qualify (event missing, or fewer than two distinct outlets)."""

    event = await session.get(Event, event_id)
    if event is None:
        return None

    rows = (await session.execute(_DOCS_SQL, {"event_id": event_id})).all()
    docs: list[_Doc] = [
        _Doc(
            document_id=r.document_id,
            source_name=r.source_name,
            source_domain=r.source_domain,
            url=r.url,
            published_at=r.published_at,
            source_country=r.source_country,
            title=r.title,
            embedding=_to_vec(r.embedding),
        )
        for r in rows
    ]
    # Full coverage is a multi-source concept.
    distinct_outlets = {(d.source_name or d.source_domain) for d in docs}
    if len(docs) < 2 or len(distinct_outlets) < 2:
        return None

    threshold = get_settings().coverage_angle_sim_threshold
    sims = _cosine_matrix(docs)
    groups = _connected_components(len(docs), sims, threshold)

    # Representative per angle = earliest-published member (docs are time-sorted, so
    # the first index is earliest). Label from its translated headline.
    rep_index = {gi: members[0] for gi, members in enumerate(groups)}
    rep_ids = [docs[idx].document_id for idx in rep_index.values()]
    fallback = {
        docs[idx].document_id: (docs[idx].title or "(untitled)") for idx in rep_index.values()
    }
    labels = await _angle_labels(session, rep_ids, fallback, target_lang)

    angles: list[CoverageAngleOut] = []
    for gi, members in enumerate(groups):
        member_docs = [docs[m] for m in members]
        rep = docs[rep_index[gi]]
        earliest = next((d.published_at for d in member_docs if d.published_at is not None), None)
        angles.append(
            CoverageAngleOut(
                label=labels.get(rep.document_id, rep.title or "(untitled)"),
                outlets=[_item(d) for d in member_docs],
                size=len(member_docs),
                earliest=earliest,
            )
        )
    # Largest angles first; ties broken by earliest coverage then label for stability.
    angles.sort(key=lambda a: (-a.size, a.earliest is None, str(a.earliest), a.label))

    # By-country facet.
    country_counts: dict[str | None, int] = defaultdict(int)
    for d in docs:
        country_counts[d.source_country] += 1
    by_country = [
        CountryCoverageOut(country=c, count=n)
        for c, n in sorted(country_counts.items(), key=lambda kv: (-kv[1], kv[0] or "zz"))
    ]

    # Stance facet (entity-targeted; per document = mean of its stance rows).
    stance_rows = (await session.execute(_STANCE_SQL, {"event_id": event_id})).all()
    per_doc: dict[uuid.UUID, list[int]] = defaultdict(list)
    for r in stance_rows:
        per_doc[r.document_id].append(int(r.stance))
    supportive = critical = neutral = 0
    for d in docs:
        vals = per_doc.get(d.document_id)
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        if mean > 0:
            supportive += 1
        elif mean < 0:
            critical += 1
        else:
            neutral += 1
    assessed_docs = supportive + critical + neutral
    stance = StanceSummaryOut(
        supportive=supportive,
        critical=critical,
        neutral=neutral,
        unassessed=len(docs) - assessed_docs,
        assessed=assessed_docs > 0,
    )

    return FullCoverageOut(
        event_id=event_id,
        total_outlets=len(docs),
        angles=angles,
        by_country=by_country,
        stance=stance,
    )
