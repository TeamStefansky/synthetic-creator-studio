"""Cost gate: translation is scoped to edition/digest items, never the corpus.

With a large ingested corpus, only the documents that actually enter an edition
(or digest) are ever translated — the rest have zero translation rows — and the
frontier model is not used for translation at all.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Document, LlmCall, Translation
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import TranslationBatchOut
from newsradar.site.edition import build_edition
from tests.site import _edition_factory as ef


def _translate_responder(purpose: str, user: str, response_model: type) -> TranslationBatchOut:
    import json

    payload = json.loads(user)
    return TranslationBatchOut(
        documents=[
            {
                "doc_index": p["doc_index"],
                "source_lang": "he",
                **{f: "EN: " + str(v) for f, v in p.items() if f in ("title", "extract", "body")},
            }
            for p in payload
        ]
    )


@pytest.mark.asyncio
async def test_translation_scope_bounded_by_edition(session: AsyncSession) -> None:
    await ef.reset(session)
    interest = await ef.make_interest(session, "world")

    # A large corpus (600 Hebrew docs) — translating all of it would be the bug.
    total_docs = 600
    for sidx in range(30):
        src = await ef.make_source(session, f"s{sidx}.co.il", tier=2, lang="he")
        for j in range(20):
            doc = await ef.f.make_document(
                session,
                src,
                title=f"כותרת {sidx}-{j}",
                lang="he",
                published_at=ef.NOW - dt.timedelta(hours=1, minutes=sidx * 20 + j),
            )
            await ef.add_interest_match(session, doc.id, interest)
    await session.commit()

    edition = await build_edition(
        session, FakeLLMClient(_translate_responder), now=ef.NOW, size=60, generate_blurbs=False
    )
    assert edition.item_count == 60

    # Only the edition's documents were translated — never the whole corpus.
    translated_docs = int(
        (
            await session.execute(select(func.count(func.distinct(Translation.document_id))))
        ).scalar_one()
    )
    assert translated_docs <= 120, f"translated {translated_docs} docs — scope leak"
    assert translated_docs == 60  # exactly the edition items here

    corpus = int((await session.execute(select(func.count()).select_from(Document))).scalar_one())
    assert corpus == total_docs
    assert translated_docs < corpus

    # Zero Sonnet (frontier) translation calls; translation uses the cheap tier only.
    sonnet = int(
        (
            await session.execute(
                select(func.count())
                .select_from(LlmCall)
                .where(LlmCall.purpose == "translate", LlmCall.model.like("%sonnet%"))
            )
        ).scalar_one()
    )
    assert sonnet == 0
