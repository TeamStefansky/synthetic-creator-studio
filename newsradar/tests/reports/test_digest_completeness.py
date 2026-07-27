"""Digest completeness gate: every headline in the context appears in the markdown.

The renderer must never sample: a context with 140 headlines yields markdown that
contains all 140 original-article URLs.
"""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.llm.client import FakeLLMClient
from newsradar.llm.schemas import DigestOut
from newsradar.reports.digest_builder import (
    DigestContext,
    DigestHeadline,
    DigestInterestSection,
)
from newsradar.reports.digest_renderer import render_digest

NOW = dt.datetime(2026, 7, 27, 7, 0, tzinfo=dt.UTC)


def _context_with_n_headlines(n: int, *, interests: int = 4) -> DigestContext:
    sections: list[DigestInterestSection] = []
    made = 0
    per = n // interests
    for i in range(interests):
        count = per if i < interests - 1 else n - made
        headlines = [
            DigestHeadline(
                story_type="document",
                story_id=uuid.uuid4(),
                headline_en=f"Interest {i} headline {j}",
                source_name=f"Outlet {j % 7}",
                source_country="US",
                published_at=NOW - dt.timedelta(hours=j % 24),
                url=f"https://example{i}.com/article-{j}-{uuid.uuid4().hex[:8]}",
            )
            for j in range(count)
        ]
        made += count
        sections.append(
            DigestInterestSection(
                interest_id=uuid.uuid4(),
                interest_name=f"Interest {i}",
                headline_count=len(headlines),
                had_nothing=not headlines,
                headlines=headlines,
            )
        )
    return DigestContext(
        generated_at=NOW,
        period_start=NOW - dt.timedelta(hours=24),
        period_end=NOW,
        lookback_hours=24,
        total_headlines=n,
        duplicates_suppressed=17,
        interests=sections,
    )


def _faithful_renderer(purpose: str, user: str, response_model: type) -> DigestOut:
    """A renderer double that lists EVERY headline (URL + source) from the context."""

    import json

    ctx = json.loads(user.split("JSON):\n", 1)[1])
    lines = [
        f"Digest for the period: {ctx['total_headlines']} headlines, "
        f"{ctx['duplicates_suppressed']} duplicates suppressed.",
        "",
    ]
    for section in ctx["interests"]:
        lines.append(f"## {section['interest_name']}")
        if section["had_nothing"]:
            lines.append("Nothing new this period.")
        for h in section["headlines"]:
            lines.append(
                f"- [{h['headline_en']}]({h['url']}) — {h['source_name']} "
                f"({h['source_country']}), {h['published_at']}"
            )
        lines.append("")
    return DigestOut(markdown="\n".join(lines))


@pytest.mark.asyncio
async def test_renderer_lists_every_headline(session: AsyncSession) -> None:
    ctx = _context_with_n_headlines(140)
    assert ctx.total_headlines == 140
    urls = ctx.all_urls()
    assert len(urls) == 140

    rendered = await render_digest(
        session, FakeLLMClient(_faithful_renderer), ctx, render_pdf=False
    )

    for url in urls:
        assert url in rendered.markdown, f"missing headline URL {url}"
    # And the count is exactly right (no phantom/duplicated links added).
    assert rendered.markdown.count("https://") == 140
