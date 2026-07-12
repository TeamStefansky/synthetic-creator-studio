"""One-shot full pipeline: ingest → authenticity → coordination → narratives → alerts.

Runs the whole analysis chain once against the configured database and exits.
This is what the dashboard's "Run pipeline" button triggers over HTTP, packaged
as a command for a scheduled Cron Job (Render free tier) or manual runs:

    python -m app.pipeline

Each stage is isolated so one failure doesn't abort the rest; a summary is
logged at the end.
"""
from __future__ import annotations

import logging

from .alerts.engine import evaluate as evaluate_alerts
from .authenticity.engine import score_all
from .config import settings
from .coordination.engine import detect_campaigns
from .db import SessionLocal
from .ingest.service import ingest_source
from .narratives.engine import run as run_narratives

logging.basicConfig(level=logging.INFO, format="%(asctime)s [pipeline] %(message)s")
log = logging.getLogger("pipeline")


def run_all(db, query: str | None = None) -> dict:
    """Run the full pipeline against `db`. `query` (keywords) is passed to every
    connector; when omitted each connector uses its configured default."""
    summary: dict = {"query": query, "ingest": {}, "authenticity": None,
                     "coordination": None, "narratives": None, "alerts": None}
    for source in settings.sources():
        try:
            res = ingest_source(db, source, query=query)
            summary["ingest"][source] = {
                "fetched": res.fetched, "inserted": res.inserted,
                "duplicates": res.duplicates, "errors": res.errors, "status": res.status,
            }
            log.info("ingest %s: inserted=%s dup=%s err=%s", source, res.inserted, res.duplicates, res.errors)
        except Exception as exc:
            log.error("ingest %s failed: %s", source, exc)

    for stage, fn in (
        ("authenticity", lambda: score_all(db)),
        ("coordination", lambda: detect_campaigns(db)),
        ("narratives", lambda: run_narratives(db)),
        ("alerts", lambda: evaluate_alerts(db)),
    ):
        try:
            summary[stage] = fn()
            log.info("%s: %s", stage, summary[stage])
        except Exception as exc:
            log.error("%s failed: %s", stage, exc)
    return summary


def main() -> None:
    log.info("full pipeline starting; sources=%s", settings.sources())
    db = SessionLocal()
    try:
        run_all(db)
    finally:
        db.close()
    log.info("full pipeline done")


if __name__ == "__main__":
    main()
