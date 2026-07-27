"""``to_story_out`` — the SINGLE builder of a reader story payload (P6).

Every ``/site/`` and ``/p/`` route serialises stories through this one function,
which is where the content-rights gate lives:

* ``documents.body`` (as ``body_en``) is emitted **only** when the source's
  ``content_rights`` is ``full_ok`` — never for ``link_only``/``extract_ok`` and
  never a translated body for any other tier;
* ``extract_en`` is capped at the tier's length (300 / 400);
* every payload carries a non-empty ``source_name`` and an absolute external
  ``url`` (the ORIGINAL article) — the attribution gate.

Because it is the only builder, these guarantees hold on every route by
construction.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.api.schemas import (
    CoverageItemOut,
    EditionItemOut,
    EditionOut,
    StoryOut,
)
from newsradar.db.models import (
    ContentRights,
    Document,
    DocumentMedia,
    Edition,
    EditionItem,
    Source,
    StoryType,
    Translation,
    TranslationField,
)
from newsradar.pipeline.normalize import EXTRACT_OK_MAX_CHARS, LINK_ONLY_MAX_CHARS
from newsradar.site.stories import representative_ids
from newsradar.translate.service import FAILED_MODEL, PASSTHROUGH_MODEL

# Extract length cap per content-rights tier. full_ok keeps the extract_ok cap for
# the card; its full text is available separately as body_en.
_EXTRACT_CAP: dict[ContentRights, int] = {
    ContentRights.link_only: LINK_ONLY_MAX_CHARS,
    ContentRights.extract_ok: EXTRACT_OK_MAX_CHARS,
    ContentRights.full_ok: EXTRACT_OK_MAX_CHARS,
}


def _cap(value: str | None, max_chars: int) -> str | None:
    if not value:
        return None
    collapsed = " ".join(value.split())
    if len(collapsed) <= max_chars:
        return collapsed
    return collapsed[: max_chars - 1].rstrip() + "…"


def _status(model: str | None) -> str:
    if model == PASSTHROUGH_MODEL:
        return "passthrough"
    if model == FAILED_MODEL:
        return "failed"
    return "ok"


_COVERAGE_SQL = text(
    """
    SELECT s.name AS source_name, d.url AS url,
           coalesce(d.published_at, d.fetched_at) AS published_at,
           s.country_code AS source_country
    FROM event_documents ed
    JOIN documents d ON d.id = ed.document_id
    JOIN sources s ON s.id = d.source_id
    WHERE ed.event_id = :event_id AND d.dedup_of IS NULL
    ORDER BY coalesce(d.published_at, d.fetched_at) ASC NULLS LAST, d.id
    """
)


async def _resolve_rep(
    session: AsyncSession,
    *,
    story_type: str,
    event_id: uuid.UUID | None,
    document_id: uuid.UUID | None,
) -> uuid.UUID | None:
    if story_type == "document":
        return document_id
    if event_id is None:
        return None
    return (await representative_ids(session, [event_id])).get(event_id)


async def to_story_out(
    session: AsyncSession,
    *,
    story_type: str,
    event_id: uuid.UUID | None = None,
    document_id: uuid.UUID | None = None,
    reason: str = "",
    personal_score: float = 0.0,
    blurb: str | None = None,
    target_lang: str = "en",
) -> StoryOut | None:
    """Build the one-and-only reader story payload, enforcing the rights gate."""

    rep_id = await _resolve_rep(
        session, story_type=story_type, event_id=event_id, document_id=document_id
    )
    if rep_id is None:
        return None

    row = (
        await session.execute(
            select(Document, Source, DocumentMedia)
            .join(Source, Source.id == Document.source_id)
            .outerjoin(DocumentMedia, DocumentMedia.document_id == Document.id)
            .where(Document.id == rep_id)
        )
    ).first()
    if row is None:
        return None
    doc, source, media = row

    translations = {
        t.field: t
        for t in (
            (
                await session.execute(
                    select(Translation).where(
                        Translation.document_id == rep_id,
                        Translation.target_lang == target_lang,
                    )
                )
            )
            .scalars()
            .all()
        )
    }
    title_tr = translations.get(TranslationField.title)
    extract_tr = translations.get(TranslationField.extract)
    body_tr = translations.get(TranslationField.body)

    headline_en = (title_tr.text if title_tr else None) or doc.title or "(untitled)"
    source_lang = (title_tr.source_lang if title_tr else None) or doc.lang

    rights = source.content_rights
    cap = _EXTRACT_CAP.get(rights, LINK_ONLY_MAX_CHARS)
    extract_source = extract_tr.text if extract_tr else doc.summary
    extract_en = _cap(extract_source, cap)

    # --- the single content-rights guard: body only for full_ok ---
    body_en: str | None = None
    if rights == ContentRights.full_ok:
        body_en = (body_tr.text if body_tr else None) or doc.body

    coverage: list[CoverageItemOut] | None = None
    story_id = document_id if story_type == "document" else event_id
    if story_type == "event" and event_id is not None:
        coverage = [
            CoverageItemOut(
                source_name=r.source_name,
                url=r.url,
                published_at=r.published_at,
                source_country=r.source_country,
            )
            for r in (await session.execute(_COVERAGE_SQL, {"event_id": event_id})).all()
        ]

    return StoryOut(
        id=story_id or rep_id,
        story_type=story_type,
        headline_en=headline_en,
        headline_original=doc.title,
        source_lang=source_lang,
        translation_status=_status(title_tr.model if title_tr else None),
        extract_en=extract_en,
        body_en=body_en,
        blurb=blurb,
        source_name=source.name or source.domain,
        source_domain=source.domain,
        source_country=source.country_code,
        favicon_url=media.favicon_url if media else None,
        image_url=media.image_url if media else None,
        image_alt=media.image_alt if media else None,
        byline=media.byline if media else None,
        published_at=doc.published_at or doc.fetched_at,
        url=doc.url,
        frameable=media.frameable if media else None,
        reason=reason,
        personal_score=personal_score,
        coverage=coverage,
    )


async def story_from_edition_item(
    session: AsyncSession, item: EditionItem, *, target_lang: str = "en"
) -> StoryOut | None:
    """Serialise one edition item (its placement metadata + story) via the chokepoint."""

    return await to_story_out(
        session,
        story_type="event" if item.story_type == StoryType.event else "document",
        event_id=item.event_id,
        document_id=item.document_id,
        reason=item.reason,
        personal_score=item.personal_score,
        blurb=item.blurb,
        target_lang=target_lang,
    )


async def serialize_edition(
    session: AsyncSession, edition: Edition, *, target_lang: str = "en"
) -> EditionOut:
    """Serialise a whole edition — every route to the front page goes through here."""

    items = (
        (
            await session.execute(
                select(EditionItem)
                .where(EditionItem.edition_id == edition.id)
                .order_by(EditionItem.position)
            )
        )
        .scalars()
        .all()
    )
    out_items: list[EditionItemOut] = []
    sections: list[str] = []
    for item in items:
        story = await story_from_edition_item(session, item, target_lang=target_lang)
        if story is None:
            continue
        if item.section not in sections:
            sections.append(item.section)
        out_items.append(EditionItemOut(position=item.position, section=item.section, story=story))
    return EditionOut(
        id=edition.id,
        generated_at=edition.generated_at,
        lookback_hours=edition.lookback_hours,
        item_count=edition.item_count,
        sections=sections,
        items=out_items,
    )
