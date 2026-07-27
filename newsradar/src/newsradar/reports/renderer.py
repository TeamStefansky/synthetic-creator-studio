"""Render a :class:`ReportContext` into Hebrew Markdown, HTML and PDF.

Exactly one frontier (Sonnet) call happens here: the compact context JSON goes in,
Hebrew Markdown comes back (never raw article text — a cost and hallucination
control). The Markdown is then converted to a clean RTL HTML page (Jinja2) and,
best-effort, to a PDF via WeasyPrint. PDF rendering degrades gracefully: if the
system libraries are unavailable the Markdown and HTML are still returned and
``artifact_path`` is ``None``.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import LlmCall
from newsradar.llm.client import LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import ReportOut
from newsradar.logging import get_logger
from newsradar.reports.context import ReportContext

log = get_logger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
REPORT_PURPOSE = "report_render"


@dataclass(frozen=True)
class RenderedReport:
    """The rendered outputs plus the model/token accounting for the reports row."""

    markdown: str
    html: str
    artifact_path: str | None
    model: str
    input_tokens: int
    output_tokens: int


@cache
def _jinja_env():  # type: ignore[no-untyped-def]
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml", "j2"]),
    )


def markdown_to_html(context: ReportContext, markdown_text: str, model: str) -> str:
    """Render report Markdown into the RTL-aware HTML template."""

    import markdown as md

    body_html = md.markdown(
        markdown_text, extensions=["tables", "fenced_code", "sane_lists", "nl2br"]
    )
    template = _jinja_env().get_template("report.html.j2")
    rendered: str = template.render(
        title=f"NewsRadar — {context.watchlist_name}",
        watchlist_name=context.watchlist_name,
        period_start=context.period_start.isoformat(),
        period_end=context.period_end.isoformat(),
        generated_at=context.generated_at.isoformat(),
        model=model,
        body_html=body_html,
    )
    return rendered


def html_to_pdf(html: str, out_path: Path) -> str | None:
    """Best-effort PDF render; returns the path or ``None`` if WeasyPrint is unusable."""

    try:
        import weasyprint

        out_path.parent.mkdir(parents=True, exist_ok=True)
        weasyprint.HTML(string=html).write_pdf(str(out_path))
        return str(out_path)
    except Exception as exc:  # noqa: BLE001 - PDF is best-effort, never fatal
        log.warning("report.pdf_failed", error=str(exc))
        return None


async def _last_call_tokens(session: AsyncSession, purpose: str) -> tuple[int, int]:
    row = (
        await session.execute(
            select(LlmCall.input_tokens, LlmCall.output_tokens)
            .where(LlmCall.purpose == purpose, LlmCall.ok.is_(True))
            .order_by(LlmCall.created_at.desc())
            .limit(1)
        )
    ).first()
    return (int(row[0]), int(row[1])) if row else (0, 0)


async def render_report(
    session: AsyncSession,
    llm: LLMClient,
    context: ReportContext,
    *,
    model: str | None = None,
    artifact_dir: str | None = None,
    artifact_name: str | None = None,
    render_pdf: bool = True,
) -> RenderedReport:
    """Generate the Hebrew Markdown report (one Sonnet call) and render HTML + PDF."""

    settings = get_settings()
    model = model or settings.sonnet_model
    system = load_prompt("report.md")
    user = "Report context (JSON):\n" + context.model_dump_json()

    out = await llm.generate_structured(
        purpose=REPORT_PURPOSE,
        model=model,
        system=system,
        user=user,
        response_model=ReportOut,
    )
    input_tokens, output_tokens = await _last_call_tokens(session, REPORT_PURPOSE)

    html = markdown_to_html(context, out.markdown, model)

    artifact_path: str | None = None
    if render_pdf:
        base = Path(artifact_dir or settings.report_artifact_dir)
        name = artifact_name or f"report_{context.watchlist_id}_{uuid.uuid4().hex[:8]}.pdf"
        artifact_path = html_to_pdf(html, base / name)

    return RenderedReport(
        markdown=out.markdown,
        html=html,
        artifact_path=artifact_path,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


async def persist_report(
    session: AsyncSession,
    context: ReportContext,
    rendered: RenderedReport,
    *,
    schedule_id: uuid.UUID | None = None,
    now: dt.datetime | None = None,
) -> uuid.UUID:
    """Insert a ``reports`` row from a rendered report; returns its id."""

    from newsradar.db.models import Report

    event_ids = [e.event_id for e in context.top_events] + [e.event_id for e in context.new_events]
    # De-duplicate while preserving order.
    seen: set[uuid.UUID] = set()
    unique_event_ids: list[uuid.UUID] = []
    for eid in event_ids:
        if eid not in seen:
            seen.add(eid)
            unique_event_ids.append(eid)

    report = Report(
        watchlist_id=context.watchlist_id,
        schedule_id=schedule_id,
        period_start=context.period_start,
        period_end=context.period_end,
        markdown=rendered.markdown,
        html=rendered.html,
        artifact_path=rendered.artifact_path,
        model=rendered.model,
        input_tokens=rendered.input_tokens,
        output_tokens=rendered.output_tokens,
        event_ids=unique_event_ids or None,
    )
    if now is not None:
        report.generated_at = now
    session.add(report)
    await session.commit()
    return report.id
