"""Editions — immutable, ranked, source-diverse front-page snapshots (P6).

An **edition** is built once and never mutated, so the page stays stable while
someone reads it and a shared link keeps showing the same stories. A **story** is
an ``events`` row when the event has ``source_count >= 2`` (a corroborated story),
otherwise a standalone canonical ``documents`` row; a document already inside a
qualifying event is never emitted separately.

The build is deterministic (frozen clock → identical ordering) and enforces three
diversity constraints at selection time:

* no two items from the same event (events are collapsed to one story);
* no single source exceeds ``EDITION_MAX_SOURCE_SHARE`` of the edition;
* every interest with any qualifying candidate gets at least two slots.

Translation of the selected items runs **before** the edition row is committed, so
a published edition is never partially translated.
"""

from __future__ import annotations

import datetime as dt
import math
import uuid
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.config import Settings, get_settings
from newsradar.db.models import Edition, EditionItem, StoryType, Watchlist, WatchlistKind
from newsradar.llm.client import LLMClient
from newsradar.logging import get_logger
from newsradar.site import weights as w
from newsradar.site.ranking import StoryFeatures, personal_score
from newsradar.translate.service import translate_documents

log = get_logger(__name__)

TOP_SECTION = "top"
TOP_SECTION_SIZE = 10
MIN_SLOTS_PER_INTEREST = 2
BLURB_TOP_N = 15


@dataclass
class Story:
    """One resolved, scored candidate story (event or standalone document)."""

    story_type: str  # 'event' | 'document'
    key: str  # stable identity for tie-breaking / dedup
    event_id: uuid.UUID | None
    document_id: uuid.UUID | None  # for document stories
    representative_doc_id: uuid.UUID
    interest_scores: dict[uuid.UUID, float] = field(default_factory=dict)
    source_id: uuid.UUID | None = None
    source_tier: int | None = None
    credibility: float = 0.5
    source_count: int = 1
    heat: float = 0.0
    published_at: dt.datetime | None = None
    score: float = 0.0

    def primary_interest(self, names: dict[uuid.UUID, str]) -> uuid.UUID | None:
        """The interest with the strongest match (ties broken by interest name)."""

        if not self.interest_scores:
            return None
        return max(
            self.interest_scores,
            key=lambda iid: (self.interest_scores[iid], _neg_name(names.get(iid, ""))),
        )


def _neg_name(name: str) -> tuple[int, ...]:
    """A reversible key so ``max`` breaks ties toward the alphabetically-first name."""

    return tuple(-ord(c) for c in name)


def _ts_component(ts: dt.datetime | None) -> float:
    """Sort component making newer items come first; unknown timestamps sort last."""

    return -ts.timestamp() if ts is not None else math.inf


def _order_key(s: Story) -> tuple[float, float, str]:
    return (-s.score, _ts_component(s.published_at), s.key)


def _age_phrase(published_at: dt.datetime | None, now: dt.datetime) -> str:
    if published_at is None:
        return "time unknown"
    delta = now - published_at
    minutes = int(delta.total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 48:
        return f"{hours}h ago"
    return f"{hours // 24}d ago"


def _reason(
    interest_name: str | None, source_count: int, published_at: dt.datetime | None, now: dt.datetime
) -> str:
    parts: list[str] = []
    if interest_name:
        parts.append(interest_name)
    unit = "source" if source_count == 1 else "sources"
    parts.append(f"{source_count} {unit}")
    parts.append(_age_phrase(published_at, now))
    return " · ".join(parts)


_CANDIDATE_SQL = text(
    """
    SELECT
        d.id AS doc_id,
        d.source_id AS source_id,
        s.tier AS tier,
        s.credibility_score AS credibility,
        coalesce(d.published_at, d.fetched_at) AS ts,
        m.watchlist_id AS interest_id,
        m.match_score AS match_score
    FROM documents d
    JOIN document_matches m ON m.document_id = d.id
    JOIN watchlists wl ON wl.id = m.watchlist_id
        AND wl.kind = 'interest' AND wl.active = true
    JOIN sources s ON s.id = d.source_id
    WHERE d.dedup_of IS NULL
      AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
    """
)

_EVENT_SQL = text(
    """
    SELECT ed.document_id AS doc_id, e.id AS event_id,
           e.source_count AS source_count, e.heat_score AS heat_score
    FROM event_documents ed
    JOIN events e ON e.id = ed.event_id
    WHERE e.source_count >= 2 AND ed.document_id = ANY(:doc_ids)
    """
)


@dataclass
class _DocInfo:
    source_id: uuid.UUID
    tier: int | None
    credibility: float
    ts: dt.datetime | None
    interest_scores: dict[uuid.UUID, float]


async def _load_candidates(
    session: AsyncSession, start_at: dt.datetime
) -> dict[uuid.UUID, _DocInfo]:
    """Load interest-matched, in-window, non-dedup documents keyed by id."""

    docs: dict[uuid.UUID, _DocInfo] = {}
    for r in (await session.execute(_CANDIDATE_SQL, {"start_at": start_at})).all():
        info = docs.get(r.doc_id)
        if info is None:
            info = _DocInfo(
                source_id=r.source_id,
                tier=r.tier,
                credibility=float(r.credibility) if r.credibility is not None else 0.5,
                ts=r.ts,
                interest_scores={},
            )
            docs[r.doc_id] = info
        score = float(r.match_score) if r.match_score is not None else 0.0
        prev = info.interest_scores.get(r.interest_id)
        if prev is None or score > prev:
            info.interest_scores[r.interest_id] = score
    return docs


async def _load_events(
    session: AsyncSession, doc_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[uuid.UUID, int, float]]:
    """Map each candidate doc to its best corroborating event (source_count>=2)."""

    best: dict[uuid.UUID, tuple[uuid.UUID, int, float]] = {}
    if not doc_ids:
        return best
    for r in (await session.execute(_EVENT_SQL, {"doc_ids": doc_ids})).all():
        cur = best.get(r.doc_id)
        cand = (r.event_id, int(r.source_count), float(r.heat_score or 0.0))
        # Prefer the most-corroborated event; break ties deterministically by id.
        if cur is None or (cand[1], str(cand[0])) > (cur[1], str(cur[0])):
            best[r.doc_id] = cand
    return best


def _build_stories(
    docs: dict[uuid.UUID, _DocInfo],
    events: dict[uuid.UUID, tuple[uuid.UUID, int, float]],
) -> list[Story]:
    """Collapse candidate documents into stories (events dedup; singletons stand alone)."""

    # Group candidate docs that belong to the same event.
    event_members: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    standalone: list[uuid.UUID] = []
    event_meta: dict[uuid.UUID, tuple[int, float]] = {}
    for doc_id in docs:
        ev = events.get(doc_id)
        if ev is not None:
            event_members[ev[0]].append(doc_id)
            event_meta[ev[0]] = (ev[1], ev[2])
        else:
            standalone.append(doc_id)

    stories: list[Story] = []

    for event_id, members in event_members.items():
        rep = min(members, key=lambda d: (docs[d].tier or 99, _ts_component(docs[d].ts), str(d)))
        interest_scores: dict[uuid.UUID, float] = {}
        for d in members:
            for iid, sc in docs[d].interest_scores.items():
                if sc > interest_scores.get(iid, -1.0):
                    interest_scores[iid] = sc
        source_count, heat = event_meta[event_id]
        info = docs[rep]
        stories.append(
            Story(
                story_type="event",
                key=f"event:{event_id}",
                event_id=event_id,
                document_id=None,
                representative_doc_id=rep,
                interest_scores=interest_scores,
                source_id=info.source_id,
                source_tier=info.tier,
                credibility=info.credibility,
                source_count=source_count,
                heat=heat,
                published_at=info.ts,
            )
        )

    for doc_id in standalone:
        info = docs[doc_id]
        stories.append(
            Story(
                story_type="document",
                key=f"document:{doc_id}",
                event_id=None,
                document_id=doc_id,
                representative_doc_id=doc_id,
                interest_scores=dict(info.interest_scores),
                source_id=info.source_id,
                source_tier=info.tier,
                credibility=info.credibility,
                source_count=1,
                heat=0.0,
                published_at=info.ts,
            )
        )
    return stories


def _select(
    stories: list[Story],
    *,
    interests_order: list[uuid.UUID],
    target: int,
    max_per_source: int,
) -> list[Story]:
    """Diversity-constrained, deterministic selection of ``target`` stories."""

    ordered = sorted(stories, key=_order_key)
    selected: list[Story] = []
    selected_keys: set[str] = set()
    per_source: dict[uuid.UUID | None, int] = defaultdict(int)

    def can_add(s: Story) -> bool:
        return per_source[s.source_id] < max_per_source

    def add(s: Story) -> None:
        selected.append(s)
        selected_keys.add(s.key)
        per_source[s.source_id] += 1

    # Phase A: guarantee >=2 slots for every interest with candidates.
    for interest_id in interests_order:
        count = 0
        for s in ordered:
            if count >= MIN_SLOTS_PER_INTEREST or len(selected) >= target:
                break
            if interest_id not in s.interest_scores:
                continue
            if s.key in selected_keys:
                count += 1  # an already-selected story counts toward the minimum
                continue
            if can_add(s):
                add(s)
                count += 1

    # Phase B: fill remaining slots by global score, respecting the source cap.
    for s in ordered:
        if len(selected) >= target:
            break
        if s.key in selected_keys or not can_add(s):
            continue
        add(s)

    return selected


def _place(selected: list[Story], names: dict[uuid.UUID, str]) -> list[tuple[Story, str]]:
    """Assign each selected story a section and a global display order (position)."""

    ordered = sorted(selected, key=_order_key)
    top = ordered[:TOP_SECTION_SIZE]
    top_keys = {s.key for s in top}
    rest = [s for s in ordered if s.key not in top_keys]

    by_interest: dict[uuid.UUID | None, list[Story]] = defaultdict(list)
    for s in rest:
        by_interest[s.primary_interest(names)].append(s)

    def agg(items: list[Story]) -> float:
        return sum(i.score for i in items)

    interest_ids = sorted(
        by_interest.keys(),
        key=lambda iid: (-agg(by_interest[iid]), names.get(iid, "") if iid else "~"),
    )

    placed: list[tuple[Story, str]] = [(s, TOP_SECTION) for s in top]
    for iid in interest_ids:
        section = names.get(iid, "Other") if iid is not None else "Other"
        for s in sorted(by_interest[iid], key=_order_key):
            placed.append((s, section))
    return placed


async def build_edition(
    session: AsyncSession,
    llm: LLMClient,
    *,
    now: dt.datetime | None = None,
    lookback_hours: int | None = None,
    size: int | None = None,
    settings: Settings | None = None,
    generate_blurbs: bool = True,
) -> Edition:
    """Build and persist one immutable edition. Deterministic under a frozen clock."""

    settings = settings or get_settings()
    now = now or dt.datetime.now(dt.UTC)
    lookback_hours = lookback_hours or settings.edition_lookback_hours
    size = size or settings.edition_size
    start_at = now - dt.timedelta(hours=lookback_hours)
    halflife = settings.edition_recency_halflife_hours

    interests = list(
        (
            await session.execute(
                select(Watchlist)
                .where(Watchlist.kind == WatchlistKind.interest, Watchlist.active.is_(True))
                .order_by(Watchlist.name)
            )
        )
        .scalars()
        .all()
    )
    interest_names = {i.id: i.name for i in interests}
    interests_order = [i.id for i in interests]

    docs = await _load_candidates(session, start_at)
    events = await _load_events(session, list(docs.keys()))
    stories = _build_stories(docs, events)

    for s in stories:
        s.score = personal_score(
            StoryFeatures(
                interest_affinity_raw=max(s.interest_scores.values(), default=0.0),
                source_count=s.source_count,
                source_tier=s.source_tier,
                credibility_score=s.credibility,
                heat_score=s.heat,
                published_at=s.published_at,
            ),
            now=now,
            halflife_hours=halflife,
        )

    target = min(size, len(stories))
    max_per_source = max(1, int(settings.edition_max_source_share * target))
    selected = _select(
        stories, interests_order=interests_order, target=target, max_per_source=max_per_source
    )
    placed = _place(selected, interest_names)

    # Translation runs BEFORE the edition commits — never partially translated.
    rep_ids = [s.representative_doc_id for s, _ in placed]
    await translate_documents(session, llm, rep_ids, target_lang=settings.reader_target_lang)

    blurbs: dict[str, str] = {}
    if generate_blurbs and placed:
        from newsradar.site.blurb import generate_blurbs_for

        top_stories = [s for s, _ in sorted(placed, key=lambda p: _order_key(p[0]))][:BLURB_TOP_N]
        blurbs = await generate_blurbs_for(
            session, llm, top_stories, target_lang=settings.reader_target_lang
        )

    edition = Edition(
        generated_at=now,
        lookback_hours=lookback_hours,
        item_count=len(placed),
        config_snapshot={
            "size": size,
            "lookback_hours": lookback_hours,
            "recency_halflife_hours": halflife,
            "max_source_share": settings.edition_max_source_share,
            "target_lang": settings.reader_target_lang,
            "weights_version": w.READER_WEIGHTS_VERSION,
            "weights": w.RANKING_WEIGHTS,
        },
    )
    session.add(edition)
    await session.flush()

    for position, (s, section) in enumerate(placed):
        primary = s.primary_interest(interest_names)
        session.add(
            EditionItem(
                edition_id=edition.id,
                position=position,
                section=section,
                story_type=StoryType.event if s.story_type == "event" else StoryType.document,
                event_id=s.event_id,
                document_id=s.document_id,
                personal_score=s.score,
                reason=_reason(
                    interest_names.get(primary) if primary else None,
                    s.source_count,
                    s.published_at,
                    now,
                ),
                blurb=blurbs.get(s.key),
            )
        )
    await session.commit()
    log.info("edition.built", edition_id=str(edition.id), items=len(placed))
    return edition


async def current_edition(session: AsyncSession) -> Edition | None:
    """Return the most recent edition (the reader's ``current`` front page)."""

    return (
        await session.execute(select(Edition).order_by(Edition.generated_at.desc()).limit(1))
    ).scalar_one_or_none()
