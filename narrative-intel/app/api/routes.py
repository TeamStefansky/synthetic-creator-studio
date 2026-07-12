"""REST API for the ingestion layer (Stage 1). Expands in later stages."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..authenticity.engine import score_all, score_author
from ..connectors import available_sources, get_connector
from ..alerts.engine import evaluate as evaluate_alerts
from ..coordination.engine import detect_campaigns, graph
from ..db import get_session
from ..ingest.service import ingest_source
from ..models import (
    Alert, AlertRule, Author, Campaign, CampaignEvidence, IngestRun, Narrative, Post,
)
from ..narratives.engine import run as run_narratives, volume_over_time
from ..pipeline import run_all as run_pipeline
from ..report.generator import (
    build_campaign_report, build_narrative_report, render_html,
)
from ..schemas import (
    AlertOut, AlertRuleIn, AlertRuleOut, AuthorDetailOut, AuthorOut, CampaignOut,
    IngestResult, NarrativeOut, PostOut,
)

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_session)) -> dict:
    connectors = []
    for name in available_sources():
        try:
            connectors.append(get_connector(name).health())
        except Exception as exc:  # pragma: no cover
            connectors.append({"source": name, "ok": False, "error": str(exc)})
    return {
        "ok": True,
        "posts": db.scalar(select(func.count()).select_from(Post)) or 0,
        "authors": db.scalar(select(func.count()).select_from(Author)) or 0,
        "connectors": connectors,
    }


@router.get("/sources")
def sources() -> dict:
    return {"sources": available_sources()}


@router.post("/ingest/run", response_model=list[IngestResult])
def run_ingest(
    source: str | None = Query(default=None, description="one source, or all when omitted"),
    query: str | None = Query(default=None, description="keyword query (defaults per-connector)"),
    db: Session = Depends(get_session),
) -> list[IngestResult]:
    targets = [source] if source else available_sources()
    results = []
    for name in targets:
        if name not in available_sources():
            raise HTTPException(status_code=400, detail=f"Unknown source '{name}'")
        results.append(ingest_source(db, name, query=query))
    return results


@router.post("/search")
def search_and_analyze(
    query: str = Query(..., min_length=2, description="keywords to detect across all sources"),
    db: Session = Depends(get_session),
) -> dict:
    """Ingest every source for these keywords, then run the full analysis
    pipeline (authenticity → coordination → narratives → alerts) and return a
    run summary. This is what the dashboard's keyword search calls."""
    return run_pipeline(db, query=query)


@router.get("/posts", response_model=list[PostOut])
def list_posts(
    source: str | None = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_session),
) -> list[Post]:
    stmt = select(Post).order_by(Post.id.desc()).limit(limit).offset(offset)
    if source:
        stmt = select(Post).where(Post.source == source).order_by(Post.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


@router.get("/authors", response_model=list[AuthorOut])
def list_authors(
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_session),
) -> list[Author]:
    return list(db.scalars(select(Author).order_by(Author.id.desc()).limit(limit).offset(offset)))


@router.get("/authors/{author_id}", response_model=AuthorDetailOut)
def author_detail(author_id: int, db: Session = Depends(get_session)) -> Author:
    author = db.get(Author, author_id)
    if not author:
        raise HTTPException(status_code=404, detail="Author not found")
    return author


@router.post("/authenticity/run")
def run_authenticity(
    author_id: int | None = Query(default=None, description="one author, or all when omitted"),
    db: Session = Depends(get_session),
) -> dict:
    if author_id is not None:
        author = db.get(Author, author_id)
        if not author:
            raise HTTPException(status_code=404, detail="Author not found")
        return {"author_id": author_id, "authenticity_score": score_author(db, author)}
    return score_all(db)


@router.post("/coordination/run")
def run_coordination(
    window_minutes: int = Query(default=60, ge=1, le=1440),
    db: Session = Depends(get_session),
) -> dict:
    return detect_campaigns(db, window_minutes=window_minutes)


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(db: Session = Depends(get_session)) -> list[Campaign]:
    return list(db.scalars(select(Campaign).order_by(Campaign.coordination_score.desc())))


@router.get("/campaigns/{campaign_id}")
def campaign_detail(campaign_id: int, db: Session = Depends(get_session)) -> dict:
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    accounts = []
    for ca in c.accounts:
        a = db.get(Author, ca.author_id)
        if a:
            accounts.append({"id": a.id, "handle": a.handle or a.display_name, "source": a.source,
                             "authenticity_score": a.authenticity_score})
    evidence = []
    for ev in db.scalars(select(CampaignEvidence).where(CampaignEvidence.campaign_id == c.id)):
        p = db.get(Post, ev.post_id)
        if p:
            evidence.append({"post_id": p.id, "source": p.source, "text": p.text,
                             "url": p.url, "timestamp": p.timestamp, "author_id": p.author_id})
    return {
        "id": c.id, "coordination_score": c.coordination_score, "sample_text": c.sample_text,
        "account_count": c.account_count, "post_count": c.post_count,
        "time_start": c.time_start, "time_end": c.time_end, "sources": c.sources,
        "accounts": accounts, "evidence": evidence,
    }


@router.get("/coordination/graph")
def coordination_graph(db: Session = Depends(get_session)) -> dict:
    return graph(db)


@router.post("/narratives/run")
def run_narrative_pipeline(db: Session = Depends(get_session)) -> dict:
    return run_narratives(db)


@router.get("/narratives", response_model=list[NarrativeOut])
def list_narratives(db: Session = Depends(get_session)) -> list[Narrative]:
    return list(db.scalars(select(Narrative).order_by(Narrative.post_count.desc())))


@router.get("/narratives/{narrative_id}")
def narrative_detail(narrative_id: int, db: Session = Depends(get_session)) -> dict:
    n = db.get(Narrative, narrative_id)
    if not n:
        raise HTTPException(status_code=404, detail="Narrative not found")
    posts = list(db.scalars(select(Post).where(Post.narrative_id == n.id).limit(50)))
    return {
        "id": n.id, "label": n.label, "summary": n.summary, "keywords": n.keywords,
        "post_count": n.post_count, "account_count": n.account_count,
        "sentiment_avg": n.sentiment_avg, "manipulation_index": n.manipulation_index,
        "first_seen": n.first_seen, "last_seen": n.last_seen,
        "volume_over_time": volume_over_time(db, n.id),
        "posts": [{"id": p.id, "source": p.source, "text": p.text, "sentiment": p.sentiment,
                   "author_id": p.author_id, "timestamp": p.timestamp} for p in posts],
    }


@router.post("/alerts/rules", response_model=AlertRuleOut)
def create_rule(rule: AlertRuleIn, db: Session = Depends(get_session)) -> AlertRule:
    obj = AlertRule(**rule.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.get("/alerts/rules", response_model=list[AlertRuleOut])
def list_rules(db: Session = Depends(get_session)) -> list[AlertRule]:
    return list(db.scalars(select(AlertRule).order_by(AlertRule.id.desc())))


@router.delete("/alerts/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_session)) -> dict:
    obj = db.get(AlertRule, rule_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(obj)
    db.commit()
    return {"deleted": rule_id}


@router.post("/alerts/evaluate")
def run_alerts(db: Session = Depends(get_session)) -> dict:
    return evaluate_alerts(db)


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(limit: int = Query(default=50, le=200), db: Session = Depends(get_session)) -> list[Alert]:
    return list(db.scalars(select(Alert).order_by(Alert.id.desc()).limit(limit)))


@router.get("/report/campaign/{campaign_id}")
def report_campaign(
    campaign_id: int,
    format: str = Query(default="html", pattern="^(html|json)$"),
    db: Session = Depends(get_session),
):
    report = build_campaign_report(db, campaign_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if format == "json":
        return report
    return HTMLResponse(render_html(report))


@router.get("/report/narrative/{narrative_id}")
def report_narrative(
    narrative_id: int,
    format: str = Query(default="html", pattern="^(html|json)$"),
    db: Session = Depends(get_session),
):
    report = build_narrative_report(db, narrative_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Narrative not found")
    if format == "json":
        return report
    return HTMLResponse(render_html(report))


@router.get("/runs")
def list_runs(limit: int = Query(default=20, le=100), db: Session = Depends(get_session)) -> list[dict]:
    runs = db.scalars(select(IngestRun).order_by(IngestRun.id.desc()).limit(limit))
    return [
        {"id": r.id, "source": r.source, "status": r.status, "fetched": r.fetched,
         "inserted": r.inserted, "duplicates": r.duplicates, "errors": r.errors,
         "started_at": r.started_at, "finished_at": r.finished_at}
        for r in runs
    ]
