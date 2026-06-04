"""Analytics: ingestion, aggregation, dashboard, and strategy feedback loop (M7)."""
from __future__ import annotations

from app.analytics.service import AnalyticsService


def test_record_and_summary(session, persona):
    svc = AnalyticsService(session)
    svc.record(persona_id=persona.id, platform="instagram", metric="reach", value=1000)
    svc.record(persona_id=persona.id, platform="instagram", metric="reach", value=2000)
    svc.record(persona_id=persona.id, platform="instagram", metric="engagement", value=0.05)

    summary = svc.summary(persona_id=persona.id)
    assert summary["reach"]["count"] == 2
    assert summary["reach"]["avg"] == 1500
    assert summary["engagement"]["avg"] == 0.05


def test_strategy_feedback_surfaces_best_platform_and_recs(session, persona):
    svc = AnalyticsService(session)
    svc.record(persona_id=persona.id, platform="tiktok", metric="engagement", value=0.5)
    svc.record(persona_id=persona.id, platform="instagram", metric="engagement", value=0.01)
    svc.record(persona_id=persona.id, platform="instagram", metric="sentiment", value=-0.2)

    fb = svc.strategy_feedback(persona_id=persona.id)
    assert fb["best_platform"] == "tiktok"
    assert any("sentiment" in r.lower() for r in fb["recommendations"])


def test_dashboard_bundles_metrics_compliance_and_feedback(session, persona):
    svc = AnalyticsService(session)
    svc.record(persona_id=persona.id, platform="instagram", metric="reach", value=10)
    dash = svc.dashboard(persona_id=persona.id)
    assert set(dash) == {"persona_id", "metrics", "compliance", "strategy_feedback"}
    assert dash["compliance"]["published_count"] == 0  # nothing published yet
    assert "reach" in dash["metrics"]
