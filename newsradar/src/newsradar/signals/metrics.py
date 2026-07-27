"""The 10-minute signal cycle: write ``event_metrics``, then evaluate/deliver alerts.

This is the single orchestration point behind the metrics Celery task. For each
recent event it computes the current hourly bucket's metrics (velocity,
acceleration, source diversity, cross-platform lift, tier-1 share, aggregate
negativity, composite heat) and **upserts one row per event per hourly bucket** —
never recomputed on read. It then refreshes trends and evaluates the four alert
rules against the fresh metrics, honouring per-event cooldowns, and dispatches any
fired alert to Slack (degrading to "not connected" without a webhook).
"""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings, get_settings
from newsradar.db.models import Event, EventMetric, EventStatus
from newsradar.logging import get_logger
from newsradar.reports.delivery import DeliveryOutcome, SlackTransport, deliver_alert
from newsradar.signals import rules
from newsradar.signals import weights as w
from newsradar.signals.diversity import source_diversity
from newsradar.signals.negativity import event_negativity
from newsradar.signals.scoring import (
    HeatComponents,
    compute_heat,
    cross_platform_lift,
    has_tier1_source,
    has_tier1_source_asof,
    tier1_share,
)
from newsradar.signals.trends import update_trends
from newsradar.signals.velocity import event_hourly_series, latest_bucket

log = get_logger(__name__)

RECENT_EVENT_WINDOW_HOURS = 48
_ACTIVE_STATUSES = (EventStatus.emerging, EventStatus.active, EventStatus.decaying)


@dataclass
class SignalCycleResult:
    """Outcome of one signal cycle for a watchlist."""

    metrics_written: int = 0
    alerts_fired: list[str] = field(default_factory=list)
    deliveries: list[DeliveryOutcome] = field(default_factory=list)
    trends_detected: int = 0


def _bucket_of(now: dt.datetime) -> dt.datetime:
    return now.replace(minute=0, second=0, microsecond=0)


async def _prev_bucket_heat(
    session: AsyncSession, event_id: uuid.UUID, bucket_at: dt.datetime
) -> float:
    row = (
        await session.execute(
            text(
                """
                SELECT heat_score FROM event_metrics
                WHERE event_id = :event_id AND bucket_at < CAST(:bucket_at AS timestamptz)
                ORDER BY bucket_at DESC LIMIT 1
                """
            ),
            {"event_id": event_id, "bucket_at": bucket_at},
        )
    ).first()
    return float(row[0]) if row and row[0] is not None else 0.0


async def _recent_events(
    session: AsyncSession, watchlist_id: uuid.UUID, now: dt.datetime
) -> list[Event]:
    since = now - dt.timedelta(hours=RECENT_EVENT_WINDOW_HOURS)
    return list(
        (
            await session.execute(
                select(Event).where(
                    Event.watchlist_id == watchlist_id,
                    Event.status.in_(_ACTIVE_STATUSES),
                    Event.last_seen_at >= since,
                )
            )
        )
        .scalars()
        .all()
    )


async def store_event_metrics(
    session: AsyncSession, watchlist_id: uuid.UUID, *, now: dt.datetime
) -> list[tuple[Event, float, float]]:
    """Upsert the current hourly bucket's metrics for each recent event.

    Returns ``(event, current_heat, prev_heat)`` per event for alert evaluation.
    """

    bucket_at = _bucket_of(now)
    results: list[tuple[Event, float, float]] = []
    for event in await _recent_events(session, watchlist_id, now):
        series = await event_hourly_series(session, event.id, now=now)
        latest = latest_bucket(series)
        velocity = latest.velocity if latest else 0.0
        acceleration = latest.acceleration if latest else None
        diversity = await source_diversity(session, event.id)
        cpl = await cross_platform_lift(session, event.id)
        t1 = await tier1_share(session, event.id)
        neg = await event_negativity(session, event.id)
        heat = compute_heat(
            HeatComponents(
                acceleration=acceleration,
                source_diversity=diversity,
                velocity=velocity,
                cross_platform_lift=cpl,
                tier1_share=t1,
            )
        )
        prev_heat = await _prev_bucket_heat(session, event.id, bucket_at)

        stmt = pg_insert(EventMetric).values(
            event_id=event.id,
            bucket_at=bucket_at,
            doc_count=latest.doc_count if latest else 0,
            velocity=velocity,
            acceleration=acceleration,
            source_diversity=diversity,
            negativity_index=neg.aggregate.negativity_index,
            cross_platform_lift=cpl,
            heat_score=heat,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_event_metrics_event_bucket",
            set_={
                "doc_count": stmt.excluded.doc_count,
                "velocity": stmt.excluded.velocity,
                "acceleration": stmt.excluded.acceleration,
                "source_diversity": stmt.excluded.source_diversity,
                "negativity_index": stmt.excluded.negativity_index,
                "cross_platform_lift": stmt.excluded.cross_platform_lift,
                "heat_score": stmt.excluded.heat_score,
            },
        )
        await session.execute(stmt)
        event.heat_score = heat
        event.negativity_score = neg.aggregate.negativity_index
        results.append((event, heat, prev_heat))

    await session.commit()
    return results


async def _evaluate_event_alerts(
    session: AsyncSession,
    event: Event,
    current_heat: float,
    prev_heat: float,
    *,
    now: dt.datetime,
) -> list[object]:
    fired: list[object] = []

    saved = await rules.record_alert(
        session,
        rules.heat_spike(event_id=event.id, current_heat=current_heat, prev_heat=prev_heat),
        now=now,
    )
    if saved is not None:
        fired.append(saved)

    bucket_at = _bucket_of(now)
    had_tier1 = await has_tier1_source_asof(session, event.id, bucket_at - dt.timedelta(seconds=1))
    has_now = await has_tier1_source(session, event.id)
    saved = await rules.record_alert(
        session,
        rules.tier1_pickup(event_id=event.id, had_tier1=had_tier1, has_tier1=has_now),
        now=now,
    )
    if saved is not None:
        fired.append(saved)

    window_start = now - dt.timedelta(hours=w.NEG_SURGE_WINDOW_HOURS)
    neg = await event_negativity(session, event.id, since=window_start)
    for ent in neg.by_entity:
        if not ent.is_primary:
            continue
        saved = await rules.record_alert(
            session,
            rules.negative_surge(
                event_id=event.id,
                entity_id=ent.entity_id,
                entity_name=ent.entity_name,
                negative_doc_count=ent.main.negative_doc_count,
                negativity_index=ent.main.negativity_index,
            ),
            now=now,
        )
        if saved is not None:
            fired.append(saved)
    return fired


async def run_signal_cycle(
    session: AsyncSession,
    watchlist_id: uuid.UUID,
    *,
    now: dt.datetime | None = None,
    deliver: bool = True,
    settings: Settings | None = None,
    slack_transport: SlackTransport | None = None,
) -> SignalCycleResult:
    """Run one full signal cycle for a watchlist: metrics -> trends -> alerts -> delivery."""

    now = now or dt.datetime.now(dt.UTC)
    settings = settings or get_settings()
    result = SignalCycleResult()

    metric_results = await store_event_metrics(session, watchlist_id, now=now)
    result.metrics_written = len(metric_results)

    fired: list[object] = []
    for event, current_heat, prev_heat in metric_results:
        fired.extend(await _evaluate_event_alerts(session, event, current_heat, prev_heat, now=now))

    trend_results = await update_trends(session, watchlist_id, now=now)
    result.trends_detected = len(trend_results)
    for trend in trend_results:
        saved = await rules.record_alert(session, rules.new_trend(trend=trend), now=now)
        if saved is not None:
            fired.append(saved)

    from newsradar.db.models import Alert

    for alert in fired:
        assert isinstance(alert, Alert)
        result.alerts_fired.append(alert.rule_name)
        if deliver:
            outcomes = await deliver_alert(
                session, alert, settings=settings, slack_transport=slack_transport, now=now
            )
            result.deliveries.extend(outcomes)

    log.info(
        "signals.cycle",
        watchlist=str(watchlist_id),
        metrics=result.metrics_written,
        alerts=len(result.alerts_fired),
        trends=result.trends_detected,
    )
    return result
