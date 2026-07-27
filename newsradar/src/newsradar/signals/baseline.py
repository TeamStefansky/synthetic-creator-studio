"""Per-watchlist seasonal baseline: mean documents per hour-of-week.

"Quiet Saturday" must not read as a spike. A raw z-score against an event's own
recent history handles bursts, but a *seasonal* baseline captures the fact that
some hours-of-week are simply busier than others across the whole watchlist. The
baseline is the mean number of matched documents per hour-of-week slot (0..167)
over the trailing four weeks, computed in the watchlist's human calendar timezone
(Asia/Jerusalem by default) so weekends line up with the local week.

SQL-first: Postgres does the grouping/counting; Python only divides by the number
of weeks and looks slots up.
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w

DEFAULT_TZ = "Asia/Jerusalem"


def hour_of_week(ts: dt.datetime, tz: str = DEFAULT_TZ) -> int:
    """Slot 0..167 for ``ts`` in ``tz`` (0 = Sunday 00:00, matching Postgres ``dow``)."""

    local = ts.astimezone(ZoneInfo(tz))
    dow = local.isoweekday() % 7  # Mon..Sun -> 1..7 -> Mon=1 .. Sun=0
    return dow * 24 + local.hour


@dataclass
class SeasonalBaseline:
    """Mean documents per hour-of-week slot for one watchlist."""

    means: dict[int, float] = field(default_factory=dict)
    tz: str = DEFAULT_TZ

    def expected_for(self, ts: dt.datetime) -> float:
        """Expected document count for the hour-of-week slot containing ``ts``."""

        return self.means.get(hour_of_week(ts, self.tz), 0.0)


_BASELINE_SQL = text(
    """
    WITH local AS (
        SELECT coalesce(d.published_at, d.fetched_at) AT TIME ZONE :tz AS lts
        FROM documents d
        JOIN document_matches m ON m.document_id = d.id
        WHERE m.watchlist_id = :watchlist_id
          AND d.dedup_of IS NULL
          AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
          AND coalesce(d.published_at, d.fetched_at) <  CAST(:now AS timestamptz)
    )
    SELECT (extract(dow from lts) * 24 + extract(hour from lts))::int AS how, count(*) AS c
    FROM local
    GROUP BY 1
    """
)


async def build_seasonal_baseline(
    session: AsyncSession,
    watchlist_id: uuid.UUID,
    *,
    now: dt.datetime,
    tz: str = DEFAULT_TZ,
    weeks: int = w.BASELINE_WEEKS,
) -> SeasonalBaseline:
    """Build the trailing-``weeks`` seasonal baseline for a watchlist."""

    start_at = now - dt.timedelta(weeks=weeks)
    rows = (
        await session.execute(
            _BASELINE_SQL,
            {"watchlist_id": watchlist_id, "tz": tz, "start_at": start_at, "now": now},
        )
    ).all()
    means = {int(r.how): float(r.c) / weeks for r in rows}
    return SeasonalBaseline(means=means, tz=tz)
