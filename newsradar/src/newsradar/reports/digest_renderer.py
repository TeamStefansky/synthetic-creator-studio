"""Render a :class:`DigestContext` into English Markdown, HTML email, and PDF (P6).

Exactly one frontier (Sonnet) call happens here: the structured context JSON goes
in, English Markdown listing every headline comes back (never raw article text).
The Markdown is converted to an inlined-CSS, LTR, mobile-safe HTML email (Jinja2,
table layout) and, best-effort, to a PDF via the existing WeasyPrint path.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import get_settings
from newsradar.db.models import LlmCall
from newsradar.llm.client import LLMClient
from newsradar.llm.prompt_loader import load_prompt
from newsradar.llm.schemas import DigestOut
from newsradar.logging import get_logger
from newsradar.reports.digest_builder import DigestContext
from newsradar.reports.renderer import _jinja_env, html_to_pdf

log = get_logger(__name__)

DIGEST_PURPOSE = "digest_render"


@dataclass(frozen=True)
class RenderedDigest:
    markdown: str
    html: str
    artifact_path: str | None
    model: str
    input_tokens: int
    output_tokens: int


def markdown_to_email_html(context: DigestContext, markdown_text: str, model: str) -> str:
    """Render digest Markdown into the inlined-CSS, LTR email template."""

    import markdown as md

    body_html = md.markdown(markdown_text, extensions=["tables", "sane_lists", "nl2br"])
    template = _jinja_env().get_template("digest.html.j2")
    rendered: str = template.render(
        title="NewsRadar — Headline digest",
        period_start=context.period_start.isoformat(),
        period_end=context.period_end.isoformat(),
        generated_at=context.generated_at.isoformat(),
        model=model,
        body_html=body_html,
    )
    return rendered


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


async def render_digest(
    session: AsyncSession,
    llm: LLMClient,
    context: DigestContext,
    *,
    model: str | None = None,
    artifact_dir: str | None = None,
    artifact_name: str | None = None,
    render_pdf: bool = True,
) -> RenderedDigest:
    """Generate the English Markdown digest (one Sonnet call) and render HTML + PDF."""

    settings = get_settings()
    model = model or settings.sonnet_model
    system = load_prompt("headline_digest.md")
    user = "Digest context (JSON):\n" + context.model_dump_json()

    out = await llm.generate_structured(
        purpose=DIGEST_PURPOSE,
        model=model,
        system=system,
        user=user,
        response_model=DigestOut,
    )
    input_tokens, output_tokens = await _last_call_tokens(session, DIGEST_PURPOSE)

    html = markdown_to_email_html(context, out.markdown, model)

    artifact_path: str | None = None
    if render_pdf:
        base = Path(artifact_dir or settings.report_artifact_dir)
        name = artifact_name or f"digest_{uuid.uuid4().hex[:8]}.pdf"
        artifact_path = html_to_pdf(html, base / name)

    return RenderedDigest(
        markdown=out.markdown,
        html=html,
        artifact_path=artifact_path,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
