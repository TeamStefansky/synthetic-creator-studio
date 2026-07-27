"""Short English blurbs for the top edition items only (P6).

A blurb is a 1-2 sentence English gloss produced by ``claude-haiku-4-5`` from the
already-translated title + extract (and, for an event story, the reused P2 event
summary). It is generated for the top items only — never for the long tail (a cost
rule) — and failure is non-fatal (the item simply has no blurb).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import Document, Event, Translation, TranslationField
from newsradar.llm.client import LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import BlurbBatchOut
from newsradar.logging import get_logger

if TYPE_CHECKING:
    from newsradar.site.edition import Story

log = get_logger(__name__)

BLURB_PURPOSE = "blurb"


async def _translations_for(
    session: AsyncSession, doc_ids: Sequence[object], target_lang: str
) -> dict[tuple[object, TranslationField], str]:
    out: dict[tuple[object, TranslationField], str] = {}
    if not doc_ids:
        return out
    for t in (
        (
            await session.execute(
                select(Translation).where(
                    Translation.document_id.in_(doc_ids),
                    Translation.target_lang == target_lang,
                )
            )
        )
        .scalars()
        .all()
    ):
        out[(t.document_id, t.field)] = t.text
    return out


async def generate_blurbs_for(
    session: AsyncSession,
    llm: LLMClient,
    stories: list[Story],
    *,
    target_lang: str = "en",
    model: str | None = None,
) -> dict[str, str]:
    """Return ``{story.key: blurb}`` for the given (already top-ranked) stories.

    One Haiku call over the batch; on any failure returns an empty mapping so the
    edition still commits (blurbs are optional).
    """

    if not stories:
        return {}
    model = model or get_settings().haiku_model

    rep_ids = [s.representative_doc_id for s in stories]
    translations = await _translations_for(session, rep_ids, target_lang)

    # Original titles/extracts as a fallback when a translation is missing.
    originals: dict[object, tuple[str | None, str | None]] = {}
    for doc in (
        (await session.execute(select(Document).where(Document.id.in_(rep_ids)))).scalars().all()
    ):
        originals[doc.id] = (doc.title, doc.summary)

    event_ids = [s.event_id for s in stories if s.event_id is not None]
    summaries: dict[object, str | None] = {}
    if event_ids:
        for ev in (
            (await session.execute(select(Event).where(Event.id.in_(event_ids)))).scalars().all()
        ):
            summaries[ev.id] = ev.summary

    payload: list[dict[str, object]] = []
    index_to_key: dict[int, str] = {}
    for idx, s in enumerate(stories):
        rep = s.representative_doc_id
        title = (
            translations.get((rep, TranslationField.title)) or (originals.get(rep) or (None,))[0]
        )
        extract = translations.get((rep, TranslationField.extract))
        if extract is None:
            orig = originals.get(rep)
            extract = orig[1] if orig else None
        item: dict[str, object] = {"item_index": idx, "headline": title or ""}
        if extract:
            item["extract"] = extract
        if s.event_id is not None and summaries.get(s.event_id):
            item["event_summary"] = summaries[s.event_id]
        payload.append(item)
        index_to_key[idx] = s.key

    try:
        out = await llm.generate_structured(
            purpose=BLURB_PURPOSE,
            model=model,
            system=load_prompt("blurb.md"),
            user=json.dumps(payload, ensure_ascii=False),
            response_model=BlurbBatchOut,
        )
    except Exception as exc:  # noqa: BLE001 - blurbs are optional; never block the edition
        log.warning("blurb.batch_failed", error=str(exc), items=len(payload))
        return {}

    result: dict[str, str] = {}
    for bo in out.items:
        key = index_to_key.get(bo.item_index)
        if key is not None and bo.blurb.strip():
            result[key] = bo.blurb.strip()
    return result
