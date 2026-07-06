"""Alerts engine tests (Stage 5)."""
from sqlalchemy import select

from app.alerts.engine import evaluate
from app.authenticity.engine import score_all
from app.coordination.engine import detect_campaigns
from app.ingest.service import ingest_source
from app.models import Alert, AlertRule
from app.narratives.engine import run as run_narratives


def _setup(db):
    ingest_source(db, "x")
    ingest_source(db, "telegram")  # has a negative "policy will destroy" post
    score_all(db)
    detect_campaigns(db)
    run_narratives(db)


def test_new_campaign_rule_fires_once(db):
    _setup(db)
    db.add(AlertRule(name="Campaigns", type="new_campaign", threshold=50, channel="inapp"))
    db.commit()
    first = evaluate(db)
    assert first["alerts_created"] >= 1
    # Idempotent: re-evaluating creates no duplicates (dedup + cooldown).
    second = evaluate(db)
    assert second["alerts_created"] == 0
    assert len(list(db.scalars(select(Alert)))) == first["alerts_created"]


def test_high_manipulation_rule(db):
    _setup(db)
    db.add(AlertRule(name="Manip", type="high_manipulation", threshold=50, channel="inapp"))
    db.commit()
    res = evaluate(db)
    assert res["alerts_created"] >= 1
    a = db.scalar(select(Alert))
    assert a.delivered is True  # inapp always delivers
    assert a.title


def test_entity_mention_rule(db):
    _setup(db)
    db.add(AlertRule(name="Watch policy", type="entity_mention", threshold=0,
                     channel="inapp", config={"entity": "policy"}))
    db.commit()
    res = evaluate(db)
    # mock posts mention "policy" with negative sentiment -> an alert
    assert res["alerts_created"] >= 1


def test_disabled_rule_does_nothing(db):
    _setup(db)
    db.add(AlertRule(name="off", type="new_campaign", threshold=1, channel="inapp", enabled=False))
    db.commit()
    assert evaluate(db)["alerts_created"] == 0
