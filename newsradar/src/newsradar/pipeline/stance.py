"""Entity-targeted stance assessment (the domain's key negativity signal).

Runs only on documents that match a watchlist which has ``watchlist_entities``,
and only on (document, entity) pairs where the entity actually appears in the
text. One Haiku call handles up to 5 pairs, returning a :class:`StanceOut` per
pair. Stance is the posture of the text *toward the entity* — explicitly NOT the
document's overall sentiment (see ``llm/prompts/stance.md``).

Results upsert into ``stance_assessments`` keyed by (document_id, entity_id).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import Document, DocumentMatch, StanceAssessment, WatchlistEntity
from newsradar.llm.client import BudgetExceeded, LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import StanceBatchOut
from newsradar.logging import get_logger
from newsradar.pipeline.matcher import _compile_term_regex

log = get_logger(__name__)

STANCE_BATCH_SIZE = 5


def _entity_patterns(entity: WatchlistEntity) -> list[re.Pattern[str]]:
    names = [entity.name, *(entity.aliases or [])]
    return [_compile_term_regex(n) for n in names if n]


def entity_appears(text: str, entity: WatchlistEntity) -> bool:
    """Whether the entity name or any alias appears in ``text`` (word-boundary aware)."""

    return any(p.search(text) for p in _entity_patterns(entity))


def _doc_text(doc: Document) -> str:
    return "\n".join(p for p in (doc.title, doc.body or doc.summary) if p)


@dataclass
class _Pair:
    document_id: uuid.UUID
    entity_id: uuid.UUID
    entity_name: str
    text: str


def _build_stance_prompt(pairs: Sequence[_Pair]) -> str:
    lines = []
    for i, pair in enumerate(pairs):
        lines.append(f'[pair_index={i}] entity="{pair.entity_name}"')
        lines.append(f"Document text:\n{pair.text[:2500]}")
        lines.append("")
    return "\n".join(lines)


async def _existing_pairs(
    session: AsyncSession, watchlist_id: uuid.UUID
) -> set[tuple[uuid.UUID, uuid.UUID]]:
    rows = (
        await session.execute(
            select(StanceAssessment.document_id, StanceAssessment.entity_id).where(
                StanceAssessment.entity_id.in_(
                    select(WatchlistEntity.id).where(WatchlistEntity.watchlist_id == watchlist_id)
                )
            )
        )
    ).all()
    return {(d, e) for d, e in rows}


async def assess_stance(
    session: AsyncSession,
    llm: LLMClient,
    *,
    watchlist_id: uuid.UUID,
    force: bool = False,
) -> int:
    """Assess entity-targeted stance for a watchlist. Returns the number of pairs written."""

    entities = list(
        (
            await session.execute(
                select(WatchlistEntity).where(WatchlistEntity.watchlist_id == watchlist_id)
            )
        )
        .scalars()
        .all()
    )
    if not entities:
        return 0

    docs = list(
        (
            await session.execute(
                select(Document).where(
                    Document.dedup_of.is_(None),
                    Document.id.in_(
                        select(DocumentMatch.document_id).where(
                            DocumentMatch.watchlist_id == watchlist_id
                        )
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    if not docs:
        return 0

    existing = set() if force else await _existing_pairs(session, watchlist_id)

    pairs: list[_Pair] = []
    for doc in docs:
        text = _doc_text(doc)
        if not text:
            continue
        for entity in entities:
            if (doc.id, entity.id) in existing:
                continue
            if entity_appears(text, entity):
                pairs.append(
                    _Pair(
                        document_id=doc.id,
                        entity_id=entity.id,
                        entity_name=entity.name,
                        text=text,
                    )
                )
    if not pairs:
        return 0

    settings = get_settings()
    system = load_prompt("stance.md")
    written = 0
    for start in range(0, len(pairs), STANCE_BATCH_SIZE):
        chunk = pairs[start : start + STANCE_BATCH_SIZE]
        try:
            batch = await llm.generate_structured(
                purpose="stance",
                model=settings.haiku_model,
                system=system,
                user=_build_stance_prompt(chunk),
                response_model=StanceBatchOut,
            )
        except BudgetExceeded:
            log.warning("stance.budget_exceeded", skipped=len(chunk))
            break

        by_index = {a.pair_index: a for a in batch.assessments}
        rows: list[dict[str, Any]] = []
        for i, pair in enumerate(chunk):
            out = by_index.get(i)
            if out is None:
                continue
            rows.append(
                {
                    "document_id": pair.document_id,
                    "entity_id": pair.entity_id,
                    "stance": out.stance,
                    "confidence": out.confidence,
                    "evidence_span": out.evidence_span[:200],
                    "framing": out.framing,
                    "model": settings.haiku_model,
                }
            )
        if rows:
            await _upsert_stance(session, rows)
            written += len(rows)

    await session.commit()
    log.info("stance.assess", watchlist=str(watchlist_id), written=written)
    return written


async def _upsert_stance(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    stmt = pg_insert(StanceAssessment).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["document_id", "entity_id"],
        set_={
            "stance": stmt.excluded.stance,
            "confidence": stmt.excluded.confidence,
            "evidence_span": stmt.excluded.evidence_span,
            "framing": stmt.excluded.framing,
            "model": stmt.excluded.model,
        },
    )
    await session.execute(stmt)
