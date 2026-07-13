"""Scheduled Brand Watch monitoring entrypoint (Render Cron).

Runs one monitoring cycle over every enabled watched entity, then exits:

    python -m app.watch.runner
"""
from __future__ import annotations

import logging

from ..db import SessionLocal
from .service import run_all_watched

logging.basicConfig(level=logging.INFO, format="%(asctime)s [watch] %(message)s")
log = logging.getLogger("watch")


def main() -> None:
    db = SessionLocal()
    try:
        result = run_all_watched(db)
        log.info("monitoring cycle: %s", result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
