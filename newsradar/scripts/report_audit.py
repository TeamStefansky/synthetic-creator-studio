"""Hallucination audit for a generated report.

Usage::

    uv run python scripts/report_audit.py --report <report_id>

Rebuilds the report's ``ReportContext`` (from its watchlist and reporting window)
and verifies that **every numeric figure in the report markdown appears in that
context** — allowing for rounding and share/percent conversion, and ignoring ids,
dates and URLs. Exits 0 when clean, 1 when any figure is unaccounted for.
"""

from __future__ import annotations

import argparse
import asyncio
import uuid

from newsradar.db.models import Report, ReportType
from newsradar.db.session import get_sessionmaker
from newsradar.reports.audit import extract_markdown_numbers, unmatched_numbers
from newsradar.reports.builder import build_report_context
from newsradar.reports.digest_builder import build_digest_context


async def _audit(report_id: uuid.UUID) -> int:
    factory = get_sessionmaker()
    async with factory() as session:
        report = await session.get(Report, report_id)
        if report is None:
            print(f"report {report_id} not found")
            return 1
        if not report.markdown:
            print(f"report {report_id} has no markdown")
            return 1
        if report.period_start is None or report.period_end is None:
            print(f"report {report_id} has no reporting window")
            return 1

        lookback = int((report.period_end - report.period_start).total_seconds() // 3600) or 24
        if report.report_type == ReportType.headline_digest:
            numeric_values = (
                await build_digest_context(session, lookback_hours=lookback, now=report.period_end)
            ).numeric_values()
        else:
            numeric_values = (
                await build_report_context(
                    session,
                    watchlist_id=report.watchlist_id,
                    lookback_hours=lookback,
                    sections=[],
                    now=report.period_end,
                )
            ).numeric_values()

    figures = extract_markdown_numbers(report.markdown)
    unmatched = unmatched_numbers(report.markdown, numeric_values)
    print(f"report {report_id}: {len(figures)} figures checked, {len(unmatched)} unaccounted for")
    if unmatched:
        print("UNACCOUNTED FIGURES (possible hallucinations):", sorted(unmatched))
        return 1
    print("OK — every figure in the report is traceable to the context")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit a report for fabricated numbers.")
    parser.add_argument("--report", required=True, help="report UUID")
    args = parser.parse_args(argv)
    return asyncio.run(_audit(uuid.UUID(args.report)))


if __name__ == "__main__":
    raise SystemExit(main())
