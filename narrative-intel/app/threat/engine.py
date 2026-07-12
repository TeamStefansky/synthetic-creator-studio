"""Brand Watch threat-score engine.

Given a watched entity, compute a 0-100 "is this under a coordinated
disinformation attack" score from independent, explainable signals — all scoped
to posts tagged with that entity. Each signal returns score (0-100), confidence
(0-1) and a plain-language detail; they combine weighted by weight*confidence
(same principle as the authenticity engine), so signals with no data don't skew
the result.

Framing: these are INDICATORS of a coordinated inauthentic campaign, with
evidence — not a verdict about any specific person or post.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Author, Post

# signal weights (sum ~1.0)
WEIGHTS = {
    "coordination": 0.22,
    "inauthentic": 0.20,
    "negative": 0.16,
    "cross_source": 0.14,
    "volume": 0.12,
    "narrative": 0.10,
    "newness": 0.06,
}

LABELS = {
    "coordination": "Coordination",
    "inauthentic": "Inauthentic amplification",
    "negative": "Negative sentiment skew",
    "cross_source": "Cross-source spread",
    "volume": "Volume burst",
    "narrative": "Narrative concentration",
    "newness": "Account newness",
}


def _clamp(v: float) -> int:
    return max(0, min(100, round(v)))


def _engagement_total(p: Post) -> int:
    e = p.engagement or {}
    return sum(v for v in e.values() if isinstance(v, (int, float)))


def _status(score: int) -> str:
    if score >= 66:
        return "UNDER_ATTACK"
    if score >= 34:
        return "ELEVATED"
    return "CALM"


def _sig(name: str, score: float, confidence: float, detail: str) -> dict:
    return {"key": name, "label": LABELS[name], "score": _clamp(score),
            "confidence": round(max(0.0, min(1.0, confidence)), 2), "detail": detail}


def compute(db: Session, entity: str, window_hours: int = 72) -> dict:
    posts = list(db.scalars(select(Post).where(Post.entity == entity)))
    total = len(posts)
    if total == 0:
        return {
            "entity": entity, "threat_score": 0, "status": "CALM",
            "total_posts": 0, "total_accounts": 0, "sources": [],
            "signals": [], "evidence": [], "trend": [],
            "note": "No data yet for this entity — run a search first.",
        }

    author_ids = {p.author_id for p in posts if p.author_id}
    authors = {a.id: a for a in db.scalars(select(Author).where(Author.id.in_(author_ids)))} if author_ids else {}

    signals: list[dict] = []

    # 1. Coordination — identical content from >=2 distinct accounts.
    by_hash: dict[str, set] = defaultdict(set)
    hash_posts: dict[str, int] = defaultdict(int)
    for p in posts:
        by_hash[p.content_hash].add(p.author_id)
        hash_posts[p.content_hash] += 1
    clusters = [h for h, auths in by_hash.items() if len([a for a in auths if a]) >= 2]
    coordinated_posts = sum(hash_posts[h] for h in clusters)
    coord_share = coordinated_posts / total
    signals.append(_sig("coordination", coord_share * 130,
                        0.9 if total >= 5 else 0.5,
                        f"{len(clusters)} identical-content clusters · {coordinated_posts}/{total} posts"))

    # 2. Inauthentic amplification — share of amplifying accounts scoring bot-like.
    scored = [a for a in authors.values() if a.authenticity_score is not None]
    low = [a for a in scored if a.authenticity_score <= 40]
    if scored:
        signals.append(_sig("inauthentic", len(low) / len(scored) * 100,
                            min(1.0, len(scored) / max(1, len(authors))) * 0.95,
                            f"{len(low)}/{len(scored)} accounts score bot-like (≤40)"))
    else:
        signals.append(_sig("inauthentic", 0, 0.1, "authenticity not computed yet"))

    # 3. Negative sentiment skew.
    sents = [p.sentiment for p in posts if p.sentiment is not None]
    if sents:
        avg = sum(sents) / len(sents)
        signals.append(_sig("negative", -avg * 100, min(1.0, len(sents) / total),
                            f"avg sentiment {avg:+.2f} over {len(sents)} posts"))
    else:
        signals.append(_sig("negative", 0, 0.1, "sentiment not computed yet"))

    # 4. Cross-source spread — how many platforms, and claims jumping platforms.
    srcs = Counter(p.source for p in posts)
    multi_src_hash = sum(1 for h, _ in by_hash.items()
                         if len({p.source for p in posts if p.content_hash == h}) >= 2)
    cross = len(srcs) * 18 + (30 if multi_src_hash else 0)
    signals.append(_sig("cross_source", cross, 0.8,
                        f"{len(srcs)} sources"
                        + (f" · {multi_src_hash} claims span multiple platforms" if multi_src_hash else "")))

    # 5. Volume burst — recent hour vs typical, when timestamps exist.
    buckets = _hour_buckets(posts)
    if len(buckets) >= 3:
        counts = sorted(buckets.values())
        median = counts[len(counts) // 2] or 1
        latest = buckets[max(buckets)]
        ratio = latest / median
        signals.append(_sig("volume", (ratio - 1) * 45, 0.7,
                            f"{ratio:.1f}× the typical hourly volume"))
    else:
        signals.append(_sig("volume", 0, 0.2, "not enough time span for a baseline"))

    # 6. Narrative concentration — one storyline dominating.
    narr = Counter(p.narrative_id for p in posts if p.narrative_id)
    if narr:
        top_id, top_n = narr.most_common(1)[0]
        signals.append(_sig("narrative", top_n / total * 100, min(1.0, sum(narr.values()) / total),
                            f"top narrative holds {top_n}/{total} posts"))
    else:
        signals.append(_sig("narrative", 0, 0.1, "narratives not computed yet"))

    # 7. Account newness — freshly-created accounts driving it.
    now = datetime.now(timezone.utc)
    with_age = [a for a in authors.values() if a.created_at]
    if with_age:
        new = [a for a in with_age if (now - _aware(a.created_at)).days <= 30]
        signals.append(_sig("newness", len(new) / len(with_age) * 100,
                            min(1.0, len(with_age) / max(1, len(authors))) * 0.8,
                            f"{len(new)}/{len(with_age)} accounts created in the last 30 days"))
    else:
        signals.append(_sig("newness", 0, 0.1, "account ages unavailable"))

    # Combine, weighted by weight*confidence.
    num = sum(s["score"] * WEIGHTS[s["key"]] * s["confidence"] for s in signals)
    den = sum(WEIGHTS[s["key"]] * s["confidence"] for s in signals)
    threat = _clamp(num / den) if den else 0

    return {
        "entity": entity,
        "threat_score": threat,
        "status": _status(threat),
        "window_hours": window_hours,
        "total_posts": total,
        "total_accounts": len(author_ids),
        "sources": [{"source": s, "count": n} for s, n in srcs.most_common()],
        "signals": sorted(signals, key=lambda s: s["score"] * s["confidence"], reverse=True),
        "evidence": _evidence(posts, authors),
        "trend": _trend(posts),
    }


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _hour_buckets(posts: list[Post]) -> dict[str, int]:
    b: dict[str, int] = defaultdict(int)
    for p in posts:
        if p.timestamp:
            b[_aware(p.timestamp).strftime("%Y-%m-%dT%H")] += 1
    return b


def _trend(posts: list[Post]) -> list[dict]:
    buckets: dict[str, list] = defaultdict(list)
    for p in posts:
        if p.timestamp:
            buckets[_aware(p.timestamp).strftime("%Y-%m-%dT%H:00")].append(p.sentiment)
    out = []
    for ts in sorted(buckets)[-24:]:
        sents = [s for s in buckets[ts] if s is not None]
        out.append({"ts": ts, "count": len(buckets[ts]),
                    "avg_sentiment": round(sum(sents) / len(sents), 2) if sents else None})
    return out


def _evidence(posts: list[Post], authors: dict) -> list[dict]:
    ranked = sorted(posts, key=_engagement_total, reverse=True)[:12]
    out = []
    for p in ranked:
        a = authors.get(p.author_id)
        out.append({
            "source": p.source, "text": p.text[:280], "url": p.url,
            "timestamp": p.timestamp, "sentiment": p.sentiment,
            "handle": (a.handle or a.display_name) if a else None,
            "authenticity_score": a.authenticity_score if a else None,
        })
    return out
