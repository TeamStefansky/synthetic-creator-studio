"""Translation gates: English passthrough, content-hash cache, full_ok body rule,
recorded Hebrew/Arabic fixtures, and graceful failure."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import ContentRights, LlmCall, Translation, TranslationField
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import TranslationBatchOut
from newsradar.translate.service import (
    FAILED_MODEL,
    PASSTHROUGH_MODEL,
    translate_documents,
)
from tests.pipeline import _factories as f

# Recorded translations (few-shot fixtures): proper nouns preserved.
_RECORDED = {
    "ראש הממשלה בנימין נתניהו נפגש עם נשיא ארצות הברית": (
        "Prime Minister Benjamin Netanyahu met with the President of the United States"
    ),
    "המחיר עלה ב-12 אחוזים": "The price rose by 12 percent",
    "أعلنت وزارة الصحة عن تسجيل حالات جديدة في بيروت": (
        "The Ministry of Health announced the recording of new cases in Beirut"
    ),
}


def _detect_lang(text: str) -> str:
    for ch in text:
        if "֐" <= ch <= "׿":
            return "he"
        if "؀" <= ch <= "ۿ":
            return "ar"
    return "en"


class _Counter:
    """A translation responder that counts real LLM calls."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, purpose: str, user: str, response_model: type) -> TranslationBatchOut:
        self.calls += 1
        payload = json.loads(user)
        docs = []
        for item in payload:
            combined = " ".join(str(v) for k, v in item.items() if k != "doc_index")
            out: dict[str, object] = {
                "doc_index": item["doc_index"],
                "source_lang": _detect_lang(combined),
            }
            for fld in ("title", "extract", "body"):
                if fld in item:
                    out[fld] = _RECORDED.get(item[fld], "EN: " + str(item[fld]))
            docs.append(out)
        return TranslationBatchOut(documents=docs)


async def _translate_llm_calls(session: AsyncSession) -> int:
    return int(
        (
            await session.execute(
                select(func.count()).select_from(LlmCall).where(LlmCall.purpose == "translate")
            )
        ).scalar_one()
    )


@pytest.mark.asyncio
async def test_english_source_is_passthrough_zero_llm(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "en.com")
    doc = await f.make_document(
        session, src, title="Prime Minister meets president", summary="A short summary.", lang="en"
    )
    await session.commit()

    counter = _Counter()
    summary = await translate_documents(session, FakeLLMClient(counter), [doc.id])

    assert counter.calls == 0
    assert await _translate_llm_calls(session) == 0
    assert summary.passthrough == 2  # title + extract
    rows = (
        (await session.execute(select(Translation).where(Translation.document_id == doc.id)))
        .scalars()
        .all()
    )
    assert {r.field for r in rows} == {TranslationField.title, TranslationField.extract}
    assert all(r.model == PASSTHROUGH_MODEL and r.source_lang == "en" for r in rows)
    title = next(r for r in rows if r.field == TranslationField.title)
    assert title.text == "Prime Minister meets president"


@pytest.mark.asyncio
async def test_cache_keyed_by_content_hash_not_doc_id(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "he.com")
    hebrew = "ראש הממשלה בנימין נתניהו נפגש עם נשיא ארצות הברית"
    d1 = await f.make_document(session, src, title=hebrew, lang="he")
    await session.commit()

    counter = _Counter()
    llm = FakeLLMClient(counter)

    # First translation: one real call.
    await translate_documents(session, llm, [d1.id])
    assert counter.calls == 1
    t1 = (
        await session.execute(
            select(Translation).where(
                Translation.document_id == d1.id, Translation.field == TranslationField.title
            )
        )
    ).scalar_one()
    assert "Benjamin Netanyahu" in t1.text and t1.source_lang == "he"

    # Re-running on the SAME unchanged text: zero new calls.
    await translate_documents(session, llm, [d1.id])
    assert counter.calls == 1

    # A DIFFERENT document with identical source text: cache hit, still zero new calls.
    d2 = await f.make_document(session, src, title=hebrew, lang="he")
    await session.commit()
    summary = await translate_documents(session, llm, [d2.id])
    assert counter.calls == 1
    assert summary.cache_hits >= 1
    t2 = (
        await session.execute(
            select(Translation).where(
                Translation.document_id == d2.id, Translation.field == TranslationField.title
            )
        )
    ).scalar_one()
    assert t2.text == t1.text


@pytest.mark.asyncio
async def test_body_translated_only_for_full_ok(session: AsyncSession) -> None:
    await f.reset(session)
    full = await f.make_source(session, "full.com")
    full.content_rights = ContentRights.full_ok
    link = await f.make_source(session, "link.com")
    link.content_rights = ContentRights.link_only
    await session.flush()

    body_txt = "המחיר עלה ב-12 אחוזים"
    full_doc = await f.make_document(
        session, full, title="כותרת", summary="תקציר", body=body_txt, lang="he"
    )
    link_doc = await f.make_document(
        session, link, title="כותרת", summary="תקציר", body=body_txt, lang="he"
    )
    await session.commit()

    llm = FakeLLMClient(_Counter())
    await translate_documents(session, llm, [full_doc.id, link_doc.id])

    full_fields = {
        r.field
        for r in (
            await session.execute(select(Translation).where(Translation.document_id == full_doc.id))
        )
        .scalars()
        .all()
    }
    link_fields = {
        r.field
        for r in (
            await session.execute(select(Translation).where(Translation.document_id == link_doc.id))
        )
        .scalars()
        .all()
    }
    assert TranslationField.body in full_fields
    assert TranslationField.body not in link_fields  # licensing gate enforced in the service


@pytest.mark.asyncio
async def test_hebrew_and_arabic_headlines_preserve_proper_nouns(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "multi.com")
    he = await f.make_document(
        session, src, title="ראש הממשלה בנימין נתניהו נפגש עם נשיא ארצות הברית", lang="he"
    )
    ar = await f.make_document(
        session, src, title="أعلنت وزارة الصحة عن تسجيل حالات جديدة في بيروت", lang="ar"
    )
    await session.commit()

    await translate_documents(session, FakeLLMClient(_Counter()), [he.id, ar.id])

    he_title = (
        await session.execute(
            select(Translation.text, Translation.source_lang).where(
                Translation.document_id == he.id, Translation.field == TranslationField.title
            )
        )
    ).one()
    ar_title = (
        await session.execute(
            select(Translation.text, Translation.source_lang).where(
                Translation.document_id == ar.id, Translation.field == TranslationField.title
            )
        )
    ).one()
    assert "Benjamin Netanyahu" in he_title.text and he_title.source_lang == "he"
    assert "Beirut" in ar_title.text and ar_title.source_lang == "ar"


@pytest.mark.asyncio
async def test_failed_translation_keeps_original_text(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "boom.com")
    doc = await f.make_document(session, src, title="כותרת בעברית", lang="he")
    await session.commit()

    def _boom(purpose: str, user: str, response_model: type) -> TranslationBatchOut:
        raise RuntimeError("model unavailable")

    summary = await translate_documents(session, FakeLLMClient(_boom), [doc.id])

    assert summary.failed >= 1
    row = (
        await session.execute(
            select(Translation).where(
                Translation.document_id == doc.id, Translation.field == TranslationField.title
            )
        )
    ).scalar_one()
    assert row.model == FAILED_MODEL
    assert row.text == "כותרת בעברית"  # never blank — original kept
