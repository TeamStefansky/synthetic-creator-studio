"""Per-purpose LLM token spend report.

Usage::

    uv run python scripts/cost_report.py --hours 24

Prints, over the lookback window, per-purpose call counts and input/output tokens
with an estimated cost, and the Sonnet-vs-Haiku call ratio — the cost gate is
that Sonnet calls stay a small fraction of Haiku calls.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt

from sqlalchemy import func, select

from newsradar.db.models import LlmCall
from newsradar.db.session import get_sessionmaker
from newsradar.llm.client import estimated_cost_usd


async def _report(hours: int) -> int:
    since = dt.datetime.now(dt.UTC) - dt.timedelta(hours=hours)
    factory = get_sessionmaker()
    async with factory() as session:
        rows = (
            await session.execute(
                select(
                    LlmCall.purpose,
                    LlmCall.model,
                    func.count().label("calls"),
                    func.coalesce(func.sum(LlmCall.input_tokens), 0),
                    func.coalesce(func.sum(LlmCall.output_tokens), 0),
                )
                .where(LlmCall.created_at >= since, LlmCall.ok.is_(True))
                .group_by(LlmCall.purpose, LlmCall.model)
                .order_by(LlmCall.purpose)
            )
        ).all()

    header = f"{'purpose':<20} {'model':<28} {'calls':>7} {'in_tok':>10} {'out_tok':>10} {'usd':>8}"
    print(header)
    print("-" * len(header))
    total_cost = 0.0
    haiku_calls = sonnet_calls = 0
    for purpose, model, calls, in_tok, out_tok in rows:
        cost = estimated_cost_usd(model, int(in_tok), int(out_tok))
        total_cost += cost
        if "haiku" in model:
            haiku_calls += int(calls)
        if "sonnet" in model:
            sonnet_calls += int(calls)
        print(f"{purpose:<20} {model:<28} {calls:>7} {in_tok:>10} {out_tok:>10} {cost:>8.4f}")
    print("-" * len(header))
    print(f"total estimated cost: ${total_cost:.4f} over {hours}h")
    if haiku_calls:
        pct = 100.0 * sonnet_calls / haiku_calls
        print(f"sonnet calls = {sonnet_calls}, haiku calls = {haiku_calls} ({pct:.1f}% of Haiku)")
    else:
        print(f"sonnet calls = {sonnet_calls}, haiku calls = 0")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LLM cost report by purpose.")
    parser.add_argument("--hours", type=int, default=24)
    args = parser.parse_args(argv)
    return asyncio.run(_report(args.hours))


if __name__ == "__main__":
    raise SystemExit(main())
