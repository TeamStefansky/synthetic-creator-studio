"""Celery wiring: enrichment + reclustering tasks are registered and scheduled."""

from __future__ import annotations

# Importing the task modules registers their tasks and beat entries.
import newsradar.tasks.cluster  # noqa: F401
import newsradar.tasks.enrich  # noqa: F401
from newsradar.tasks.celery_app import celery_app


def test_pipeline_tasks_registered() -> None:
    for name in (
        "newsradar.enrich_watchlist",
        "newsradar.enrich_all",
        "newsradar.ingest_then_enrich_all",
        "newsradar.recluster_watchlist",
        "newsradar.recluster_all",
    ):
        assert name in celery_app.tasks


def test_beat_schedule_has_enrichment_and_recluster() -> None:
    beat = celery_app.conf.beat_schedule
    assert "enrichment-sweep" in beat
    assert beat["enrichment-sweep"]["task"] == "newsradar.enrich_all"
    assert beat["enrichment-sweep"]["schedule"].run_every.total_seconds() == 5 * 60

    assert "recluster-nightly" in beat
    assert beat["recluster-nightly"]["task"] == "newsradar.recluster_all"
    # Nightly crontab at 03:00.
    cron = beat["recluster-nightly"]["schedule"]
    assert cron.hour == {3} and cron.minute == {0}
