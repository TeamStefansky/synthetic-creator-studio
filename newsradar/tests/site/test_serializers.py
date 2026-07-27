"""to_story_out rights guard: body only for full_ok, extract cap, attribution."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import ContentRights, Translation, TranslationField
from newsradar.pipeline.normalize import EXTRACT_OK_MAX_CHARS, LINK_ONLY_MAX_CHARS
from newsradar.site.serializers import to_story_out
from newsradar.translate.service import PASSTHROUGH_MODEL, content_hash
from tests.site import _edition_factory as ef


async def _make_doc_with_translations(
    session: AsyncSession, rights: ContentRights, *, long_extract: str
) -> object:
    src = await ef.make_source(session, f"{rights.value}.com", rights=rights, lang="he")
    doc = await ef.f.make_document(
        session,
        src,
        title="כותרת מקורית",
        summary=long_extract,
        body="גוף הכתבה המלא בעברית " * 30,
        lang="he",
    )
    await session.flush()
    for field, txt in (
        (TranslationField.title, "Original headline in English"),
        (TranslationField.extract, "E " + ("word " * 300)),  # deliberately > 400 chars
        (TranslationField.body, "TRANSLATED BODY " * 40),
    ):
        session.add(
            Translation(
                document_id=doc.id,
                target_lang="en",
                field=field,
                source_lang="he",
                text=txt,
                model="claude-haiku-4-5-20251001",
                content_hash=content_hash(txt),
            )
        )
    await session.commit()
    return doc


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("rights", "cap"),
    [
        (ContentRights.link_only, LINK_ONLY_MAX_CHARS),
        (ContentRights.extract_ok, EXTRACT_OK_MAX_CHARS),
        (ContentRights.full_ok, EXTRACT_OK_MAX_CHARS),
    ],
)
async def test_rights_guard_body_and_extract_cap(
    session: AsyncSession, rights: ContentRights, cap: int
) -> None:
    await ef.reset(session)
    doc = await _make_doc_with_translations(session, rights, long_extract="x" * 800)

    story = await to_story_out(
        session, story_type="document", document_id=doc.id, reason="r · 1 source · 1h ago"
    )
    assert story is not None

    # extract capped at the tier length
    assert story.extract_en is not None
    assert len(story.extract_en) <= cap

    # body_en present ONLY for full_ok
    if rights == ContentRights.full_ok:
        assert story.body_en and "TRANSLATED BODY" in story.body_en
    else:
        assert story.body_en is None

    # attribution gate
    assert story.source_name
    assert story.url.startswith("http")
    assert story.headline_en == "Original headline in English"
    assert story.source_lang == "he"
    assert story.translation_status == "ok"


@pytest.mark.asyncio
async def test_passthrough_status_for_english(session: AsyncSession) -> None:
    await ef.reset(session)
    src = await ef.make_source(session, "en.com", lang="en")
    doc = await ef.f.make_document(session, src, title="English headline", lang="en")
    session.add(
        Translation(
            document_id=doc.id,
            target_lang="en",
            field=TranslationField.title,
            source_lang="en",
            text="English headline",
            model=PASSTHROUGH_MODEL,
            content_hash=content_hash("English headline"),
        )
    )
    await session.commit()

    story = await to_story_out(session, story_type="document", document_id=doc.id)
    assert story is not None
    assert story.translation_status == "passthrough"
    assert story.headline_en == "English headline"
    assert story.body_en is None
