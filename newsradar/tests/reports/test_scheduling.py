"""Cron due-evaluation with missed-window collapse."""

from __future__ import annotations

import datetime as dt

from newsradar.reports.scheduling import next_due

TZ = "Asia/Jerusalem"
DAILY_7AM = "0 7 * * *"  # 07:00 local every day


def test_first_run_returns_most_recent_fire() -> None:
    now = dt.datetime(2026, 7, 27, 9, 0, tzinfo=dt.UTC)  # 12:00 local
    due = next_due(DAILY_7AM, TZ, None, now)
    assert due is not None
    assert due.hour == 7  # 07:00 local today


def test_not_due_when_already_ran_this_window() -> None:
    now = dt.datetime(2026, 7, 27, 9, 0, tzinfo=dt.UTC)
    # Ran at 08:00 local today, after the 07:00 fire.
    last = dt.datetime(2026, 7, 27, 5, 30, tzinfo=dt.UTC)  # 08:30 local
    assert next_due(DAILY_7AM, TZ, last, now) is None


def test_due_when_window_passed_since_last_run() -> None:
    now = dt.datetime(2026, 7, 27, 9, 0, tzinfo=dt.UTC)  # 12:00 local today
    last = dt.datetime(2026, 7, 26, 12, 0, tzinfo=dt.UTC)  # yesterday
    due = next_due(DAILY_7AM, TZ, last, now)
    assert due is not None and due.day == 27 and due.hour == 7


def test_missed_windows_collapse_to_one() -> None:
    # Worker down for 3 days; last run was 4 days ago. Only ONE fire is returned
    # (the most recent), so recovery generates once, not four times.
    now = dt.datetime(2026, 7, 27, 9, 0, tzinfo=dt.UTC)
    last = dt.datetime(2026, 7, 23, 12, 0, tzinfo=dt.UTC)
    due = next_due(DAILY_7AM, TZ, last, now)
    assert due is not None and due.day == 27  # today's 07:00, not the 24th/25th/26th
