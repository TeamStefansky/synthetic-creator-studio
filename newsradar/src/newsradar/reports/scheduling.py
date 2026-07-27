"""Cron evaluation for report schedules, with missed-window collapse.

Schedules store a cron expression and an IANA timezone (Asia/Jerusalem by
default). :func:`next_due` answers "should this schedule run now, and for which
scheduled instant?" — and crucially, if the worker was down across several
scheduled times, it returns only the **most recent** missed instant, so recovery
generates the report once, not once per missed window.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from croniter import croniter


def next_due(
    cron: str,
    tz: str,
    last_run_at: dt.datetime | None,
    now: dt.datetime,
) -> dt.datetime | None:
    """Return the scheduled instant to run for, or ``None`` if not due.

    The instant returned is the most recent scheduled time at or before ``now``
    (in ``tz``). It is returned only when it is strictly newer than
    ``last_run_at`` — so a schedule fires once per scheduled window and a backlog
    of missed windows collapses to a single run.
    """

    zone = ZoneInfo(tz)
    now_local = now.astimezone(zone)
    prev_fire: dt.datetime = croniter(cron, now_local).get_prev(dt.datetime)
    if last_run_at is None:
        return prev_fire
    if last_run_at < prev_fire:
        return prev_fire
    return None
