"""Synchronous ingestion CLI for debugging.

Usage::

    uv run python -m newsradar.tasks.ingest_once --watchlist demo
    uv run python -m newsradar.tasks.ingest_once --watchlist demo --connector rss
    uv run python -m newsradar.tasks.ingest_once --watchlist demo --since 2026-07-01T00:00:00Z

Runs the exact same code path as the Celery tasks, printing a per-connector
summary table.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import sys

from newsradar.logging import configure_logging, get_logger
from newsradar.pipeline.runner import RunResult, ingest

log = get_logger("newsradar.ingest_once")


def _parse_since(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    parsed = dt.datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _print_table(results: list[RunResult]) -> None:
    header = (
        f"{'connector':<12} {'fetched':>8} {'inserted':>9} {'dupes':>7} {'errors':>7} {'status':>8}"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r.connector:<12} {r.fetched:>8} {r.inserted:>9} {r.duplicates:>7} "
            f"{r.errors:>7} {r.status:>8}"
        )


async def _main_async(args: argparse.Namespace) -> list[RunResult]:
    return await ingest(
        args.watchlist,
        connector_name=args.connector,
        since=_parse_since(args.since),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingest_once", description="Run ingestion synchronously.")
    parser.add_argument("--watchlist", required=True, help="Watchlist name or id.")
    parser.add_argument("--connector", default=None, help="Restrict to one connector by name.")
    parser.add_argument("--since", default=None, help="ISO-8601 lower bound (default: 24h ago).")
    args = parser.parse_args(argv)

    configure_logging()
    try:
        results = asyncio.run(_main_async(args))
    except LookupError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    _print_table(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
