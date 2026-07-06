"""Ingestion scheduler/worker (for the Render 'worker' service).

Polls every enabled source on a fixed interval. Each source runs with bounded
retry + exponential backoff; persistent failures are already dead-lettered by the
ingest service, so the loop never dies. Run: `python -m app.worker`.
"""
from __future__ import annotations

import logging
import time

from .config import settings
from .db import SessionLocal
from .ingest.service import ingest_source

logging.basicConfig(level=logging.INFO, format="%(asctime)s [worker] %(message)s")
log = logging.getLogger("worker")

MAX_RETRIES = 3


def run_cycle() -> None:
    for source in settings.sources():
        delay = 2
        for attempt in range(1, MAX_RETRIES + 1):
            db = SessionLocal()
            try:
                res = ingest_source(db, source)
                log.info("%s: fetched=%s inserted=%s dup=%s err=%s status=%s",
                         source, res.fetched, res.inserted, res.duplicates, res.errors, res.status)
                break
            except Exception as exc:  # unexpected — retry with backoff
                log.warning("%s attempt %s/%s failed: %s", source, attempt, MAX_RETRIES, exc)
                if attempt == MAX_RETRIES:
                    log.error("%s exhausted retries", source)
                else:
                    time.sleep(delay)
                    delay *= 2
            finally:
                db.close()


def main() -> None:
    log.info("worker starting; sources=%s interval=%ss", settings.sources(), settings.poll_interval_seconds)
    while True:
        try:
            run_cycle()
        except Exception as exc:  # never let the loop die
            log.error("cycle error: %s", exc)
        time.sleep(settings.poll_interval_seconds)


if __name__ == "__main__":
    main()
