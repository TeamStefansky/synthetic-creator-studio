"""Digest service flow: translation scope, grouping, report_type, audit clean."""

from __future__ import annotations

import datetime as dt
import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Report, ReportType, Translation, TranslationField
from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import DigestOut, TranslationBatchOut
from newsradar.reports.audit import unmatched_numbers
from newsradar.reports.digest_builder import build_digest_context
from newsradar.reports.digest_service import ensure_digest_schedule, generate_and_store_digest
from tests.site import _edition_factory as ef

NOW = dt.datetime(2026, 7, 27, 7, 0, tzinfo=dt.UTC)


def _detect(text: str) -> str:
    for ch in text:
        if "֐" <= ch <= "׿":
            return "he"
    return "en"


def _combined_responder(purpose: str, user: str, response_model: type) -> object:
    if purpose == "translate":
        payload = json.loads(user)
        docs = []
        for item in payload:
            out: dict[str, object] = {
                "doc_index": item["doc_index"],
                "source_lang": _detect(
                    " ".join(str(v) for k, v in item.items() if k != "doc_index")
                ),
            }
            for fld in ("title", "extract", "body"):
                if fld in item:
                    out[fld] = "EN: " + str(item[fld])
            docs.append(out)
        return TranslationBatchOut(documents=docs)
    if purpose == "digest_render":
        ctx = json.loads(user.split("JSON):\n", 1)[1])
        lines = [f"Period had {ctx['total_headlines']} headlines.", ""]
        for section in ctx["interests"]:
            lines.append(f"## {section['interest_name']}")
            if section["had_nothing"]:
                lines.append("Nothing new.")
            for h in section["headlines"]:
                lines.append(f"- [{h['headline_en']}]({h['url']}) — {h['source_name']}")
        return DigestOut(markdown="\n".join(lines))
    raise AssertionError(f"unexpected purpose {purpose}")


@pytest.mark.asyncio
async def test_digest_flow_translates_groups_and_audits(session: AsyncSession) -> None:
    await ef.reset(session)
    i1 = await ef.make_interest(session, "middle-east")
    i2 = await ef.make_interest(session, "tech")

    he_src = await ef.make_source(session, "he.co.il", lang="he", country_code="IL")
    en_src = await ef.make_source(session, "en.com", lang="en", country_code="US")

    he_doc = await ef.f.make_document(
        session,
        he_src,
        title="כותרת בעברית על המזרח התיכון",
        lang="he",
        published_at=NOW - dt.timedelta(hours=2),
    )
    en_doc = await ef.f.make_document(
        session,
        en_src,
        title="A tech story in English",
        lang="en",
        published_at=NOW - dt.timedelta(hours=3),
    )
    await ef.add_interest_match(session, he_doc.id, i1)
    await ef.add_interest_match(session, en_doc.id, i2)
    await session.commit()

    llm = FakeLLMClient(_combined_responder)
    run = await generate_and_store_digest(session, llm, lookback_hours=24, now=NOW)

    report = await session.get(Report, run.report_id)
    assert report is not None
    assert report.report_type == ReportType.headline_digest
    assert run.total_headlines == 2

    # The Hebrew headline was translated (title translation exists, English text).
    he_title = (
        await session.execute(
            select(Translation.text).where(
                Translation.document_id == he_doc.id,
                Translation.field == TranslationField.title,
                Translation.target_lang == "en",
            )
        )
    ).scalar_one()
    assert he_title.startswith("EN: ")
    assert he_title in report.markdown  # translated headline surfaced in the digest

    # Every headline URL appears (completeness on real data).
    assert he_doc.url in report.markdown
    assert en_doc.url in report.markdown

    # Hallucination audit: no fabricated numbers (digest-aware context).
    ctx = await build_digest_context(session, lookback_hours=24, now=NOW)
    assert unmatched_numbers(report.markdown or "", ctx.numeric_values()) == []


@pytest.mark.asyncio
async def test_ensure_digest_schedule_is_idempotent(session: AsyncSession) -> None:
    await ef.reset(session)
    interest = await ef.make_interest(session, "world")
    await session.commit()

    s1 = await ensure_digest_schedule(session, watchlist_id=interest.id, hour=7)
    s2 = await ensure_digest_schedule(session, watchlist_id=interest.id, hour=7)
    assert s1.id == s2.id
    assert s1.cron == "0 7 * * *"
    assert s1.timezone == "Asia/Jerusalem"
    assert s1.report_type == ReportType.headline_digest
    assert s1.lookback_hours == 24
