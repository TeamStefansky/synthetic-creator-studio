"""Continuous Brand Watch monitoring (Phase B).

For each watched entity: pull fresh data, recompute the threat score against a
rolling baseline, store a snapshot, and fire an escalation alert when the status
worsens (e.g. Calm → Elevated, or into Under attack).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Alert, ThreatSnapshot, WatchedEntity
from ..pipeline import run_all
from ..threat.engine import compute
from ..alerts.channels import notify_all

STATUS_ORDER = {"CALM": 0, "ELEVATED": 1, "UNDER_ATTACK": 2}
BASELINE_N = 10  # snapshots averaged for the volume baseline


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _baseline(db: Session, entity: str) -> float | None:
    counts = list(db.scalars(
        select(ThreatSnapshot.total_posts)
        .where(ThreatSnapshot.entity == entity)
        .order_by(ThreatSnapshot.id.desc()).limit(BASELINE_N)
    ))
    return (sum(counts) / len(counts)) if counts else None


def _emit_escalation(db: Session, we: WatchedEntity, prev: str, result: dict) -> Alert | None:
    status = result["status"]
    # One alert per entity+status per hour (dedup + cooldown).
    stamp = _utcnow().strftime("%Y-%m-%dT%H")
    dedup = f"watch:{we.name}:{status}:{stamp}"
    if db.scalar(select(Alert).where(Alert.dedup_key == dedup)):
        return None
    title = f"Brand Watch: '{we.name}' escalated to {status.replace('_', ' ').title()} ({result['threat_score']}/100)"
    top = ", ".join(f"{s['label']} {s['score']}" for s in result["signals"][:3])
    body = f"Was {prev.replace('_', ' ').title()}. Drivers: {top}. {result['total_posts']} posts, {result['total_accounts']} accounts."
    alert = Alert(rule_id=None, rule_name="Brand Watch", type="brandwatch_escalation",
                  title=title, body=body, dedup_key=dedup)
    db.add(alert)
    db.flush()
    alert.delivered = notify_all(alert)  # Telegram + webhook, whichever configured
    return alert


def check_entity(db: Session, we: WatchedEntity, refresh: bool = True) -> dict:
    query = we.query or we.name
    if refresh:
        run_all(db, query=query, entity=we.name)
    baseline = _baseline(db, we.name)
    result = compute(db, we.name, baseline=baseline)

    prev = we.last_status
    db.add(ThreatSnapshot(
        entity=we.name, score=result["threat_score"], status=result["status"],
        total_posts=result["total_posts"], total_accounts=result["total_accounts"],
    ))
    we.last_score = result["threat_score"]
    we.last_status = result["status"]
    we.last_checked_at = _utcnow()
    db.commit()

    escalated = (prev is not None and STATUS_ORDER[result["status"]] > STATUS_ORDER[prev]) \
        or (prev is None and result["status"] == "UNDER_ATTACK")
    if escalated:
        _emit_escalation(db, we, prev or "—", result)
        db.commit()
    result["escalated"] = escalated
    return result


def run_all_watched(db: Session) -> dict:
    entities = list(db.scalars(select(WatchedEntity).where(WatchedEntity.enabled.is_(True))))
    checked = 0
    escalations = 0
    for we in entities:
        try:
            res = check_entity(db, we)
            checked += 1
            escalations += 1 if res.get("escalated") else 0
        except Exception:
            db.rollback()
    return {"checked": checked, "escalations": escalations}
