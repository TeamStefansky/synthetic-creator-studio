"""Coordinated-behaviour detection.

A campaign = the same content (same `content_hash`, computed at ingest) posted by
>=2 DISTINCT accounts within a tight time window. For each campaign we save the
member accounts and the evidence posts, score the coordination, and add edges to
a co-posting relationship graph (accounts that appear together in campaigns).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import (
    Author, Campaign, CampaignAccount, CampaignEvidence, CoordinationEdge, Post,
)

DEFAULT_WINDOW_MINUTES = 60


def _score(n_accounts: int, window_minutes: float, avg_authenticity: float | None) -> float:
    score = 40 + (n_accounts - 2) * 15
    if window_minutes <= 5:
        score += 20
    elif window_minutes <= 60:
        score += 10
    if avg_authenticity is not None:
        score += (100 - avg_authenticity) * 0.2  # low authenticity -> up to +20
    return round(max(0.0, min(100.0, score)), 1)


def detect_campaigns(db: Session, window_minutes: int = DEFAULT_WINDOW_MINUTES) -> dict:
    # Recompute from scratch (idempotent).
    db.execute(delete(CampaignEvidence))
    db.execute(delete(CampaignAccount))
    db.execute(delete(Campaign))
    db.execute(delete(CoordinationEdge))
    db.flush()

    # Group posts by identical content.
    by_hash: dict[str, list[Post]] = defaultdict(list)
    for post in db.scalars(select(Post)):
        if post.content_hash:
            by_hash[post.content_hash].append(post)

    edge_weight: dict[tuple[int, int], int] = defaultdict(int)
    campaigns_made = 0

    for chash, posts in by_hash.items():
        authors = {p.author_id for p in posts if p.author_id is not None}
        if len(authors) < 2:
            continue  # not coordinated — single account (or unknown)

        times = [p.timestamp for p in posts if p.timestamp]
        if times:
            t0, t1 = min(times), max(times)
            window = (t1 - t0).total_seconds() / 60.0
            if window > window_minutes:
                continue  # spread out over time — not a tight burst
        else:
            t0 = t1 = None
            window = 0.0

        # Average authenticity of the member accounts (if scored).
        scores = [
            a.authenticity_score
            for a in db.scalars(select(Author).where(Author.id.in_(authors)))
            if a.authenticity_score is not None
        ]
        avg_auth = sum(scores) / len(scores) if scores else None

        campaign = Campaign(
            content_hash=chash,
            sample_text=posts[0].text[:280],
            coordination_score=_score(len(authors), window, avg_auth),
            account_count=len(authors),
            post_count=len(posts),
            time_start=t0,
            time_end=t1,
            sources=sorted({p.source for p in posts}),
        )
        db.add(campaign)
        db.flush()  # assign id

        for aid in authors:
            db.add(CampaignAccount(campaign_id=campaign.id, author_id=aid))
        for p in posts:
            db.add(CampaignEvidence(campaign_id=campaign.id, post_id=p.id))

        ordered = sorted(authors)
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                edge_weight[(ordered[i], ordered[j])] += 1

        campaigns_made += 1

    for (a, b), w in edge_weight.items():
        db.add(CoordinationEdge(author_a=a, author_b=b, weight=w))

    db.commit()
    return {"campaigns": campaigns_made, "edges": len(edge_weight)}


def graph(db: Session) -> dict:
    """Nodes (accounts in any edge) + edges, for the campaign network UI."""
    edges = list(db.scalars(select(CoordinationEdge)))
    node_ids = {e.author_a for e in edges} | {e.author_b for e in edges}
    authors = {a.id: a for a in db.scalars(select(Author).where(Author.id.in_(node_ids)))}
    nodes = [
        {
            "id": a.id,
            "handle": a.handle or a.display_name or f"#{a.id}",
            "source": a.source,
            "authenticity_score": a.authenticity_score,
        }
        for a in authors.values()
    ]
    links = [{"source": e.author_a, "target": e.author_b, "weight": e.weight} for e in edges]
    return {"nodes": nodes, "edges": links}
