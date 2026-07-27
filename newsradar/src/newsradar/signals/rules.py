"""Alert rules — a small, explicit set of plain functions. No DSL, no engine.

Each rule is a pure function returning an unsaved :class:`Alert` (or ``None``).
Persisting is separate (:func:`record_alert`) and enforces a per-event, per-rule
cooldown so a sustained condition cannot produce an alert storm. The four rules:

* ``heat_spike``   — heat crosses 70 → ``warning``; crosses 85 → ``critical``.
* ``negative_surge`` — a primary entity with ≥5 negative docs in 3h AND
  negativity_index ≥ 0.6 → ``critical``.
* ``tier1_pickup`` — an event that had no tier-1 source acquires one → ``warning``.
* ``new_trend``    — a newly-detected trend with lift ≥ 3 → ``info``.

"Crosses" means an upward transition across the threshold (previous below, current
at/above), so a condition that merely persists does not re-fire — the cooldown is a
second, blunter guard on top of that.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import Alert, AlertSeverity
from newsradar.signals import weights as w
from newsradar.signals.trends import TrendResult


def heat_spike(*, event_id: uuid.UUID, current_heat: float, prev_heat: float) -> Alert | None:
    """Fire when heat crosses a threshold upward. Critical takes precedence."""

    if current_heat >= w.HEAT_CRITICAL and prev_heat < w.HEAT_CRITICAL:
        severity = AlertSeverity.critical
        crossed = w.HEAT_CRITICAL
    elif current_heat >= w.HEAT_WARNING and prev_heat < w.HEAT_WARNING:
        severity = AlertSeverity.warning
        crossed = w.HEAT_WARNING
    else:
        return None
    return Alert(
        event_id=event_id,
        rule_name="heat_spike",
        severity=severity,
        payload={
            "crossed": crossed,
            "current_heat": round(current_heat, 2),
            "prev_heat": round(prev_heat, 2),
        },
    )


def negative_surge(
    *,
    event_id: uuid.UUID,
    entity_id: uuid.UUID,
    entity_name: str,
    negative_doc_count: int,
    negativity_index: float,
) -> Alert | None:
    """Fire on a concentrated burst of genuinely negative coverage of a primary entity."""

    if negative_doc_count >= w.NEG_SURGE_MIN_DOCS and negativity_index >= w.NEG_SURGE_MIN_INDEX:
        return Alert(
            event_id=event_id,
            rule_name="negative_surge",
            severity=AlertSeverity.critical,
            payload={
                "entity_id": str(entity_id),
                "entity_name": entity_name,
                "negative_doc_count": negative_doc_count,
                "negativity_index": round(negativity_index, 3),
                "window_hours": w.NEG_SURGE_WINDOW_HOURS,
            },
        )
    return None


def tier1_pickup(*, event_id: uuid.UUID, had_tier1: bool, has_tier1: bool) -> Alert | None:
    """Fire when an event acquires its first tier-1 source."""

    if has_tier1 and not had_tier1:
        return Alert(
            event_id=event_id,
            rule_name="tier1_pickup",
            severity=AlertSeverity.warning,
            payload={"detail": "event acquired its first tier-1 source"},
        )
    return None


def new_trend(*, trend: TrendResult) -> Alert | None:
    """Fire once for a newly-detected, strongly-lifting trend (info severity)."""

    if not trend.is_new or trend.lift < w.NEW_TREND_MIN_LIFT:
        return None
    if not trend.representative_event_ids:
        return None  # Alert.event_id is NOT NULL; anchor to a representative event
    return Alert(
        event_id=trend.representative_event_ids[0],
        rule_name="new_trend",
        severity=AlertSeverity.info,
        payload={
            "term": trend.term,
            "term_kind": trend.term_kind,
            "lift": trend.lift,
            "doc_count": trend.doc_count,
            "source_count": trend.source_count,
        },
    )


async def recently_fired(
    session: AsyncSession,
    *,
    event_id: uuid.UUID,
    rule_name: str,
    now: dt.datetime,
    cooldown_hours: int = w.ALERT_COOLDOWN_HOURS,
) -> bool:
    """Whether the same rule already fired for this event inside the cooldown window."""

    since = now - dt.timedelta(hours=cooldown_hours)
    latest = (
        await session.execute(
            select(func.max(Alert.fired_at)).where(
                Alert.event_id == event_id, Alert.rule_name == rule_name
            )
        )
    ).scalar_one_or_none()
    return latest is not None and latest >= since


async def record_alert(
    session: AsyncSession,
    alert: Alert | None,
    *,
    now: dt.datetime,
    cooldown_hours: int = w.ALERT_COOLDOWN_HOURS,
) -> Alert | None:
    """Persist ``alert`` unless the cooldown suppresses it. Returns the saved row or None."""

    if alert is None:
        return None
    if await recently_fired(
        session,
        event_id=alert.event_id,
        rule_name=alert.rule_name,
        now=now,
        cooldown_hours=cooldown_hours,
    ):
        return None
    alert.fired_at = now
    session.add(alert)
    await session.commit()
    return alert


def alert_summary(alert: Alert) -> str:
    """One-line human summary of an alert for delivery channels."""

    payload: dict[str, Any] = alert.payload or {}
    if alert.rule_name == "heat_spike":
        return f"Heat {payload.get('current_heat')} crossed {payload.get('crossed')}"
    if alert.rule_name == "negative_surge":
        return (
            f"{payload.get('negative_doc_count')} negative articles on "
            f"{payload.get('entity_name')} (index {payload.get('negativity_index')})"
        )
    if alert.rule_name == "tier1_pickup":
        return "Event picked up its first tier-1 source"
    if alert.rule_name == "new_trend":
        return f"New trend '{payload.get('term')}' (lift {payload.get('lift')})"
    return alert.rule_name
