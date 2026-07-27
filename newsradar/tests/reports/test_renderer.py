"""Report rendering via the fake LLM: structure, Hebrew, no fabricated numbers, PDF."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import ReportOut
from newsradar.reports.audit import unmatched_numbers
from newsradar.reports.builder import build_report_context
from newsradar.reports.renderer import persist_report, render_report
from tests.reports.test_builder import NOW, SECTIONS, _seed

SECTION_HEADINGS = {
    "overview": "סקירה כללית",
    "hot_events": "אירועים חמים",
    "trends": "מגמות מתפתחות",
    "negative_coverage": "סיקור שלילי",
    "geo": "פריסה גאוגרפית",
}


def _fake_report_from_context(ctx: dict[str, Any]) -> str:
    """Build faithful Hebrew Markdown that only ever cites context figures."""

    lines: list[str] = []
    lines.append(f"# NewsRadar — {ctx['watchlist_name']}")
    lines.append(f"תקופת הדיווח: {ctx['period_start']} – {ctx['period_end']}")
    lines.append("")
    lines.append("## תקציר מנהלים")
    lines.append("סקירה תמציתית של תמונת המצב בחלון הדיווח על סמך הנתונים שסופקו.")
    lines.append("")
    lines.append("## מה השתנה מאז הדוח הקודם")
    if ctx["volume"]["change_pct"] is not None:
        lines.append(f"שינוי בנפח: {ctx['volume']['change_pct']}%.")
    else:
        lines.append("אין נתוני השוואה לתקופה הקודמת.")
    for ev in ctx["new_events"]:
        lines.append(f"- אירוע חדש: {ev['title']} (חום {ev['heat_score']}, {ev['trajectory']})")
    lines.append("")

    for section in ctx["sections"]:
        lines.append(f"## {SECTION_HEADINGS[section]}")
        if section == "overview":
            v, n = ctx["volume"], ctx["noise"]
            lines.append(
                f"נאספו {n['documents_ingested']} פריטים, מתוכם "
                f"{n['duplicates_collapsed']} כפילויות; {v['current_docs']} ייחודיים "
                f"(לעומת {v['previous_docs']} בתקופה הקודמת)."
            )
        elif section == "hot_events":
            if not ctx["top_events"]:
                lines.append("אין נתונים בחלון הדיווח.")
            for ev in ctx["top_events"]:
                lines.append(f"- {ev['title']}: חום {ev['heat_score']} ({ev['trajectory']})")
        elif section == "trends":
            if not ctx["trends"]:
                lines.append("אין נתונים בחלון הדיווח.")
            for t in ctx["trends"]:
                lines.append(f"- {t['term']}: מכפיל {t['lift']}")
        elif section == "negative_coverage":
            if not ctx["negative_coverage"]:
                lines.append("אין נתונים בחלון הדיווח.")
            for e in ctx["negative_coverage"]:
                lines.append(
                    f"### {e['entity_name']} — מדד {e['negativity_index']}, "
                    f"{e['negative_doc_count']} כתבות שליליות"
                )
                for ev in e["evidence"]:
                    lines.append(f"> {ev['evidence_span']} ([מקור]({ev['url']}))")
        elif section == "geo":
            if not ctx["geo_hot_zones"] and not ctx["country_breakdown"]:
                lines.append("אין נתונים בחלון הדיווח.")
            for z in ctx["geo_hot_zones"]:
                lines.append(f"- אזור {z['country_code']}: {z['doc_count']} מסמכים, z={z['z']}")
        lines.append("")
    return "\n".join(lines)


def _responder(purpose: str, user: str, response_model: type) -> ReportOut:
    payload = json.loads(user.split("JSON):\n", 1)[1])
    return ReportOut(markdown=_fake_report_from_context(payload))


@pytest.mark.asyncio
async def test_render_report_structure_and_no_fabrication(session: AsyncSession) -> None:
    wl, ev, _entity = await _seed(session)
    ctx = await build_report_context(
        session, watchlist_id=wl.id, lookback_hours=24, sections=SECTIONS, now=NOW
    )
    llm = FakeLLMClient(_responder)

    rendered = await render_report(session, llm, ctx, artifact_dir="/tmp/nr_reports_test")

    # Hebrew Markdown with all requested sections and the mandated extras.
    md = rendered.markdown
    assert "תקציר מנהלים" in md
    assert "מה השתנה מאז הדוח הקודם" in md
    for section in SECTIONS:
        assert SECTION_HEADINGS[section] in md
    # The top event is cited by title.
    assert ev.title in md

    # THE HALLUCINATION GATE: every numeric figure in the report exists in context.
    assert unmatched_numbers(md, ctx.numeric_values()) == []

    # Token accounting flowed through from the (fake) llm_calls record.
    assert rendered.input_tokens > 0 and rendered.output_tokens > 0
    assert rendered.model  # sonnet model id

    # HTML is RTL and carries the body.
    assert 'dir="rtl"' in rendered.html
    assert "אירועים חמים" in rendered.html

    # PDF rendered (WeasyPrint available here) — real RTL PDF bytes on disk.
    assert rendered.artifact_path is not None
    pdf = Path(rendered.artifact_path)
    assert pdf.exists() and pdf.read_bytes()[:5] == b"%PDF-"
    pdf.unlink()


@pytest.mark.asyncio
async def test_persist_report_event_ids_subset_of_context(session: AsyncSession) -> None:
    wl, ev, _entity = await _seed(session)
    ctx = await build_report_context(
        session, watchlist_id=wl.id, lookback_hours=24, sections=SECTIONS, now=NOW
    )
    llm = FakeLLMClient(_responder)
    rendered = await render_report(session, llm, ctx, render_pdf=False)
    assert rendered.artifact_path is None  # PDF skipped

    report_id = await persist_report(session, ctx, rendered, now=NOW)

    from newsradar.db.models import Report

    report = await session.get(Report, report_id)
    assert report is not None
    assert report.markdown == rendered.markdown
    context_event_ids = {e.event_id for e in ctx.top_events} | {e.event_id for e in ctx.new_events}
    assert set(report.event_ids or []) <= context_event_ids
    assert ev.id in (report.event_ids or [])
