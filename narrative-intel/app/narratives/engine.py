"""Narrative enrichment + clustering + Manipulation Index.

Enrich: per-post language + sentiment (AI provider).
Cluster: greedy grouping of posts by word-set (Jaccard) similarity into narratives.
Manipulation Index: share of a narrative's engagement coming from
low-authenticity accounts (bot-driven amplification).
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..ai import get_provider
from ..models import Author, Narrative, Post

_WORD = re.compile(r"[a-z0-9]+")
SIM_THRESHOLD = 0.5          # Jaccard word-set similarity to join a narrative
LOW_AUTHENTICITY = 40.0      # accounts below this count as inauthentic


def _wordset(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if len(w) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _engagement(post: Post) -> int:
    e = post.engagement or {}
    return int(e.get("likes", 0)) + int(e.get("reposts", 0)) + int(e.get("quotes", 0)) + 1


def enrich(db: Session) -> int:
    """Set language + sentiment on every post (idempotent)."""
    provider = get_provider()
    posts = list(db.scalars(select(Post)))
    for p in posts:
        p.lang = provider.language(p.text)
        p.sentiment = provider.sentiment(p.text)
    db.commit()
    return len(posts)


def cluster(db: Session) -> dict:
    """Cluster posts into narratives (idempotent: rebuilds all)."""
    provider = get_provider()
    db.execute(update(Post).values(narrative_id=None))
    db.execute(delete(Narrative))
    db.flush()

    posts = list(db.scalars(select(Post).order_by(Post.timestamp)))
    auth = {a.id: a.authenticity_score for a in db.scalars(select(Author))}

    # Greedy clustering by word-set similarity to each cluster's centroid words.
    clusters: list[dict] = []
    for p in posts:
        ws = _wordset(p.text)
        best, best_sim = None, 0.0
        for c in clusters:
            sim = _jaccard(ws, c["words"])
            if sim > best_sim:
                best, best_sim = c, sim
        if best is not None and best_sim >= SIM_THRESHOLD:
            best["posts"].append(p)
            best["words"] |= ws
        else:
            clusters.append({"posts": [p], "words": set(ws)})

    made = 0
    for c in clusters:
        cposts: list[Post] = c["posts"]
        texts = [p.text for p in cposts]
        authors = {p.author_id for p in cposts if p.author_id is not None}
        times = [p.timestamp for p in cposts if p.timestamp]
        sentiments = [p.sentiment for p in cposts if p.sentiment is not None]

        total_eng = sum(_engagement(p) for p in cposts)
        bot_eng = sum(
            _engagement(p) for p in cposts
            if p.author_id is not None and (auth.get(p.author_id) is not None)
            and auth[p.author_id] < LOW_AUTHENTICITY
        )
        manip = round(100 * bot_eng / total_eng, 1) if total_eng else 0.0

        kw = Counter()
        for t in texts:
            kw.update(provider.keywords(t, top=6))
        keywords = [w for w, _ in kw.most_common(6)]
        label = " / ".join(keywords[:3]) or texts[0][:60]

        narrative = Narrative(
            label=label,
            summary=provider.summarize(texts),
            keywords=keywords,
            post_count=len(cposts),
            account_count=len(authors),
            sentiment_avg=round(sum(sentiments) / len(sentiments), 3) if sentiments else None,
            manipulation_index=manip,
            first_seen=min(times) if times else None,
            last_seen=max(times) if times else None,
        )
        db.add(narrative)
        db.flush()
        for p in cposts:
            p.narrative_id = narrative.id
        made += 1

    db.commit()
    return {"narratives": made, "posts": len(posts)}


def run(db: Session) -> dict:
    enriched = enrich(db)
    result = cluster(db)
    return {"enriched": enriched, **result}


def volume_over_time(db: Session, narrative_id: int, bucket_hours: int = 1) -> list[dict]:
    posts = list(db.scalars(select(Post).where(Post.narrative_id == narrative_id)))
    buckets: dict[str, int] = defaultdict(int)
    for p in posts:
        if not p.timestamp:
            continue
        key = p.timestamp.strftime("%Y-%m-%dT%H")
        buckets[key] += 1
    return [{"bucket": k, "count": v} for k, v in sorted(buckets.items())]
