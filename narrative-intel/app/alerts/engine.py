"""Alerts engine. Evaluates enabled rules against current state, creating alerts
with a stable dedup_key (natural dedup + cooldown: an alert for the same key is
created once), and delivers via the rule's channel."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Alert, AlertRule, Campaign, Narrative, Post
from .channels import get_channel


def _emit(db: Session, rule: AlertRule, dedup_key: str, title: str, body: str) -> Alert | None:
    if db.scalar(select(Alert).where(Alert.dedup_key == dedup_key)):
        return None  # already alerted (dedup + cooldown)
    alert = Alert(rule_id=rule.id, rule_name=rule.name, type=rule.type,
                  title=title, body=body, dedup_key=dedup_key)
    db.add(alert)
    db.flush()
    alert.delivered = get_channel(rule.channel).deliver(alert, rule.config)
    return alert


def _evaluate_rule(db: Session, rule: AlertRule) -> list[Alert]:
    made: list[Alert] = []

    if rule.type == "new_campaign":
        for c in db.scalars(select(Campaign).where(Campaign.coordination_score >= rule.threshold)):
            a = _emit(db, rule, f"campaign:{c.id}",
                      f"Coordinated campaign detected (score {c.coordination_score})",
                      f"{c.account_count} accounts, {c.post_count} posts. Sample: {c.sample_text[:160]}")
            if a: made.append(a)

    elif rule.type == "high_manipulation":
        for n in db.scalars(select(Narrative).where(Narrative.manipulation_index >= rule.threshold)):
            a = _emit(db, rule, f"manip:{n.id}",
                      f"High-manipulation narrative: {n.label} ({n.manipulation_index}%)",
                      f"{n.post_count} posts. {n.summary or ''}")
            if a: made.append(a)

    elif rule.type == "volume_spike":
        for n in db.scalars(select(Narrative).where(Narrative.post_count >= rule.threshold)):
            a = _emit(db, rule, f"volume:{n.id}:{n.post_count}",
                      f"Narrative volume spike: {n.label} ({n.post_count} posts)",
                      n.summary or "")
            if a: made.append(a)

    elif rule.type == "entity_mention":
        entity = ((rule.config or {}).get("entity") or "").lower()
        if entity:
            hits = [p for p in db.scalars(select(Post))
                    if entity in (p.text or "").lower() and (p.sentiment or 0) < 0]
            if hits:
                a = _emit(db, rule, f"entity:{entity}:{len(hits)}",
                          f"Monitored entity '{entity}' mentioned negatively ({len(hits)}x)",
                          f"Sample: {hits[0].text[:160]}")
                if a: made.append(a)

    return made


def evaluate(db: Session) -> dict:
    rules = list(db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True))))
    created = 0
    for rule in rules:
        created += len(_evaluate_rule(db, rule))
    db.commit()
    return {"rules_evaluated": len(rules), "alerts_created": created}
