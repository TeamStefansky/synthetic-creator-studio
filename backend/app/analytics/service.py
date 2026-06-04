"""Analytics module (Milestone 7).

Records and aggregates per-persona/platform/campaign metrics (reach,
engagement, growth, sentiment) and exposes a **compliance view**: confirmation
that every published asset carried valid disclosure. Insights feed back into
the Strategy module.

In production, metric events are ingested from platform analytics APIs. Here we
provide ingestion + aggregation + the compliance audit, which is the part that
matters for the Law.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.disclosure.gate import DisclosureGate
from app.models.analytics_event import AnalyticsEvent
from app.models.asset import Asset
from app.models.post import ApprovalState, Post


class AnalyticsService:
    def __init__(self, session: Session, *, gate: DisclosureGate | None = None):
        self.session = session
        self.gate = gate or DisclosureGate()

    def record(self, *, persona_id, platform: str, metric: str, value: float, post_id=None, extra=None) -> AnalyticsEvent:
        event = AnalyticsEvent(
            persona_id=persona_id,
            post_id=post_id,
            platform=platform.lower(),
            metric=metric,
            value=value,
            extra=extra or {},
        )
        self.session.add(event)
        self.session.flush()
        return event

    def summary(self, *, persona_id) -> dict:
        events = (
            self.session.query(AnalyticsEvent)
            .filter(AnalyticsEvent.persona_id == persona_id)
            .all()
        )
        agg: dict[str, dict] = {}
        for e in events:
            bucket = agg.setdefault(e.metric, {"count": 0, "total": 0.0})
            bucket["count"] += 1
            bucket["total"] += e.value
        for m, b in agg.items():
            b["avg"] = round(b["total"] / b["count"], 4) if b["count"] else 0.0
        return agg

    def strategy_feedback(self, *, persona_id) -> dict:
        """Turn metrics into actionable strategy adjustments (M7 → M5 loop).

        Compares average engagement/sentiment against simple thresholds and
        surfaces the best-performing platform so Strategy can re-weight pillars.
        """
        summary = self.summary(persona_id=persona_id)
        events = (
            self.session.query(AnalyticsEvent)
            .filter(AnalyticsEvent.persona_id == persona_id)
            .all()
        )
        by_platform: dict[str, float] = {}
        for e in events:
            if e.metric == "engagement":
                by_platform[e.platform] = by_platform.get(e.platform, 0.0) + e.value

        recs: list[str] = []
        eng = summary.get("engagement", {}).get("avg", 0.0)
        sent = summary.get("sentiment", {}).get("avg", 0.0)
        if eng and eng < 0.02:
            recs.append("Engagement is low — test shorter-form content and stronger hooks.")
        if sent and sent < 0.0:
            recs.append("Sentiment is negative — review tone against persona hard_boundaries.")
        best_platform = max(by_platform, key=by_platform.get) if by_platform else None
        if best_platform:
            recs.append(f"Double down on '{best_platform}' — highest cumulative engagement.")
        return {"best_platform": best_platform, "recommendations": recs}

    def dashboard(self, *, persona_id) -> dict:
        """Single payload powering the live dashboard UI."""
        return {
            "persona_id": str(persona_id),
            "metrics": self.summary(persona_id=persona_id),
            "compliance": self.compliance_view(persona_id=persona_id),
            "strategy_feedback": self.strategy_feedback(persona_id=persona_id),
        }

    def compliance_view(self, *, persona_id) -> dict:
        """Confirm every PUBLISHED asset for the persona carried valid disclosure."""
        published = (
            self.session.query(Post)
            .join(Asset, Post.asset_id == Asset.id)
            .filter(Asset.persona_id == persona_id, Post.approval_state == ApprovalState.PUBLISHED)
            .all()
        )
        rows = []
        all_ok = True
        for post in published:
            asset = self.session.get(Asset, post.asset_id)
            ok = self.gate.is_publishable(asset)
            all_ok = all_ok and ok
            rows.append(
                {
                    "post_id": str(post.id),
                    "platform": post.platform,
                    "asset_id": str(post.asset_id),
                    "disclosed": ok,
                }
            )
        return {"compliant": all_ok, "published_count": len(rows), "posts": rows}
