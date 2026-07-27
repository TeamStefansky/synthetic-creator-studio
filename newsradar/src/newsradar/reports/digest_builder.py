"""Build the ``DigestContext`` for the reader's headline digest — no LLM (P6).

The digest is a *headline* product: completeness of headlines matters more than
prose. This module assembles, from the database only, every interest's matching
stories (with the translated headline, source, country, time and original URL),
the count of items suppressed as near-duplicates, the top-3 fastest-rising
interests (reusing :mod:`newsradar.signals.trends`), the stories the user's own
feeds carried that no tier-1 global source did, and any subscription that failed
to poll. The renderer sees only this structured context — never raw article text.
"""

from __future__ import annotations

import datetime as dt
import re
import uuid
from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    FeedSubscription,
    Translation,
    TranslationField,
    Watchlist,
    WatchlistKind,
)
from newsradar.signals.trends import detect_trends
from newsradar.site.stories import representative_ids

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


class DigestHeadline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    story_type: str
    story_id: uuid.UUID
    headline_en: str
    source_name: str
    source_country: str | None
    published_at: dt.datetime | None
    url: str
    blurb: str | None = None


class DigestInterestSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interest_id: uuid.UUID
    interest_name: str
    headline_count: int
    had_nothing: bool
    headlines: list[DigestHeadline] = Field(default_factory=list)


class RisingInterest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interest_name: str
    lift: float
    top_term: str | None = None


class FailedSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feed_url: str
    consecutive_failures: int
    reason: str | None = None


class DigestContext(BaseModel):
    """The complete, LLM-free structured input to the digest renderer."""

    model_config = ConfigDict(extra="forbid")

    generated_at: dt.datetime
    period_start: dt.datetime
    period_end: dt.datetime
    lookback_hours: int
    total_headlines: int
    duplicates_suppressed: int
    interests: list[DigestInterestSection] = Field(default_factory=list)
    rising_interests: list[RisingInterest] = Field(default_factory=list)
    exclusives: list[DigestHeadline] = Field(default_factory=list)
    failed_subscriptions: list[FailedSubscription] = Field(default_factory=list)

    def all_urls(self) -> list[str]:
        """Every original-article URL the context carries (completeness check)."""

        urls = [h.url for section in self.interests for h in section.headlines]
        urls += [h.url for h in self.exclusives]
        return urls

    def numeric_values(self) -> set[float]:
        """Every figure the renderer may legitimately state.

        Includes structural counts AND numbers embedded in headline/blurb text, so
        the hallucination audit does not flag a number the renderer faithfully
        echoed from a headline (e.g. "12 killed").
        """

        from newsradar.reports.audit import collect_numbers

        numbers = collect_numbers(self.model_dump(mode="json"))
        for section in self.interests:
            for h in section.headlines:
                _numbers_from_text(h.headline_en, numbers)
                _numbers_from_text(h.blurb, numbers)
        for h in self.exclusives:
            _numbers_from_text(h.headline_en, numbers)
        return numbers


def _numbers_from_text(value: str | None, out: set[float]) -> None:
    if not value:
        return
    for tok in _NUMBER_RE.findall(value):
        out.add(float(tok))


# --------------------------------------------------------------------------------------
# Collection
# --------------------------------------------------------------------------------------

_INTEREST_DOCS_SQL = text(
    """
    SELECT d.id AS doc_id, d.url AS url, d.title AS title,
           coalesce(d.published_at, d.fetched_at) AS ts,
           s.id AS source_id, s.name AS source_name,
           s.country_code AS source_country, s.tier AS tier
    FROM documents d
    JOIN document_matches m ON m.document_id = d.id AND m.watchlist_id = :interest_id
    JOIN sources s ON s.id = d.source_id
    WHERE d.dedup_of IS NULL
      AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
      AND coalesce(d.published_at, d.fetched_at) <= CAST(:end_at AS timestamptz)
    ORDER BY coalesce(d.published_at, d.fetched_at) DESC, d.id
    """
)

_EVENT_SQL = text(
    """
    SELECT ed.document_id AS doc_id, e.id AS event_id, e.source_count AS source_count
    FROM event_documents ed
    JOIN events e ON e.id = ed.event_id
    WHERE e.source_count >= 2 AND ed.document_id = ANY(:doc_ids)
    """
)

_DUP_SQL = text(
    """
    SELECT count(DISTINCT d.id) AS c
    FROM documents d
    JOIN document_matches m ON m.document_id = d.id
    JOIN watchlists wl ON wl.id = m.watchlist_id AND wl.kind = 'interest'
    WHERE d.dedup_of IS NOT NULL
      AND coalesce(d.published_at, d.fetched_at) >= CAST(:start_at AS timestamptz)
      AND coalesce(d.published_at, d.fetched_at) <= CAST(:end_at AS timestamptz)
    """
)


@dataclass
class _DocRow:
    doc_id: uuid.UUID
    url: str
    title: str | None
    ts: dt.datetime | None
    source_id: uuid.UUID
    source_name: str
    source_country: str | None
    tier: int | None


@dataclass
class _Story:
    story_type: str
    story_id: uuid.UUID  # event_id or document_id
    rep_doc_id: uuid.UUID
    member_tiers: list[int | None] = field(default_factory=list)
    member_source_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass
class _DigestData:
    interests: list[Watchlist]
    stories_by_interest: dict[uuid.UUID, list[_Story]]
    rows_by_doc: dict[uuid.UUID, _DocRow]
    feed_source_ids: set[uuid.UUID]


async def _collect(
    session: AsyncSession, start_at: dt.datetime, end_at: dt.datetime
) -> _DigestData:
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

    rows_by_doc: dict[uuid.UUID, _DocRow] = {}
    per_interest_docs: dict[uuid.UUID, list[uuid.UUID]] = {}
    for interest in interests:
        ids: list[uuid.UUID] = []
        for r in (
            await session.execute(
                _INTEREST_DOCS_SQL,
                {"interest_id": interest.id, "start_at": start_at, "end_at": end_at},
            )
        ).all():
            rows_by_doc.setdefault(
                r.doc_id,
                _DocRow(
                    doc_id=r.doc_id,
                    url=r.url,
                    title=r.title,
                    ts=r.ts,
                    source_id=r.source_id,
                    source_name=r.source_name,
                    source_country=r.source_country,
                    tier=r.tier,
                ),
            )
            ids.append(r.doc_id)
        per_interest_docs[interest.id] = ids

    all_doc_ids = list(rows_by_doc.keys())
    doc_to_event: dict[uuid.UUID, uuid.UUID] = {}
    if all_doc_ids:
        for r in (await session.execute(_EVENT_SQL, {"doc_ids": all_doc_ids})).all():
            cur = doc_to_event.get(r.doc_id)
            if cur is None or str(r.event_id) < str(cur):
                doc_to_event[r.doc_id] = r.event_id

    event_ids = list(dict.fromkeys(doc_to_event.values()))
    reps = await representative_ids(session, event_ids)

    # Members per event (for tier-1 / feed exclusivity checks).
    event_members: dict[uuid.UUID, list[uuid.UUID]] = {}
    for member_id, evid in doc_to_event.items():
        event_members.setdefault(evid, []).append(member_id)

    feed_source_ids = {
        row[0] for row in (await session.execute(select(FeedSubscription.source_id))).all()
    }

    stories_by_interest: dict[uuid.UUID, list[_Story]] = {}
    for interest in interests:
        seen: set[uuid.UUID] = set()
        stories: list[_Story] = []
        for doc_id in per_interest_docs[interest.id]:
            ev = doc_to_event.get(doc_id)
            if ev is not None:
                if ev in seen:
                    continue
                seen.add(ev)
                members = event_members.get(ev, [doc_id])
                rep = reps.get(ev, doc_id)
                stories.append(
                    _Story(
                        story_type="event",
                        story_id=ev,
                        rep_doc_id=rep,
                        member_tiers=[rows_by_doc[m].tier for m in members if m in rows_by_doc],
                        member_source_ids=[
                            rows_by_doc[m].source_id for m in members if m in rows_by_doc
                        ],
                    )
                )
            else:
                if doc_id in seen:
                    continue
                seen.add(doc_id)
                row = rows_by_doc[doc_id]
                stories.append(
                    _Story(
                        story_type="document",
                        story_id=doc_id,
                        rep_doc_id=doc_id,
                        member_tiers=[row.tier],
                        member_source_ids=[row.source_id],
                    )
                )
        stories_by_interest[interest.id] = stories

    return _DigestData(
        interests=interests,
        stories_by_interest=stories_by_interest,
        rows_by_doc=rows_by_doc,
        feed_source_ids=feed_source_ids,
    )


async def digest_document_ids(
    session: AsyncSession, *, lookback_hours: int, now: dt.datetime
) -> list[uuid.UUID]:
    """Representative document ids the digest will show — the translation scope."""

    start_at = now - dt.timedelta(hours=lookback_hours)
    data = await _collect(session, start_at, now)
    ids: list[uuid.UUID] = []
    for stories in data.stories_by_interest.values():
        ids.extend(s.rep_doc_id for s in stories)
    return list(dict.fromkeys(ids))


async def _title_translations(
    session: AsyncSession, doc_ids: list[uuid.UUID], target_lang: str
) -> dict[uuid.UUID, str]:
    out: dict[uuid.UUID, str] = {}
    if not doc_ids:
        return out
    for t in (
        (
            await session.execute(
                select(Translation).where(
                    Translation.document_id.in_(doc_ids),
                    Translation.target_lang == target_lang,
                    Translation.field == TranslationField.title,
                )
            )
        )
        .scalars()
        .all()
    ):
        out[t.document_id] = t.text
    return out


async def build_digest_context(
    session: AsyncSession,
    *,
    lookback_hours: int,
    now: dt.datetime,
    target_lang: str = "en",
) -> DigestContext:
    """Assemble the full ``DigestContext`` from the database (no LLM involved)."""

    start_at = now - dt.timedelta(hours=lookback_hours)
    data = await _collect(session, start_at, now)

    rep_ids = list(
        dict.fromkeys(
            s.rep_doc_id for stories in data.stories_by_interest.values() for s in stories
        )
    )
    titles = await _title_translations(session, rep_ids, target_lang)

    def _headline(story: _Story) -> DigestHeadline:
        row = data.rows_by_doc[story.rep_doc_id]
        return DigestHeadline(
            story_type=story.story_type,
            story_id=story.story_id,
            headline_en=titles.get(story.rep_doc_id) or row.title or "(untitled)",
            source_name=row.source_name,
            source_country=row.source_country,
            published_at=row.ts,
            url=row.url,
        )

    sections: list[DigestInterestSection] = []
    total = 0
    for interest in data.interests:
        stories = data.stories_by_interest[interest.id]
        headlines = [_headline(s) for s in stories]
        total += len(headlines)
        sections.append(
            DigestInterestSection(
                interest_id=interest.id,
                interest_name=interest.name,
                headline_count=len(headlines),
                had_nothing=not headlines,
                headlines=headlines,
            )
        )

    # Exclusives: a story with no tier-1 source but at least one of the user's feeds.
    exclusives: list[DigestHeadline] = []
    seen_excl: set[uuid.UUID] = set()
    for stories in data.stories_by_interest.values():
        for s in stories:
            if s.story_id in seen_excl:
                continue
            has_tier1 = any(t == 1 for t in s.member_tiers)
            from_feed = any(sid in data.feed_source_ids for sid in s.member_source_ids)
            if from_feed and not has_tier1:
                seen_excl.add(s.story_id)
                exclusives.append(_headline(s))

    duplicates = int(
        (await session.execute(_DUP_SQL, {"start_at": start_at, "end_at": now})).scalar_one()
    )

    rising = await _rising_interests(session, data.interests, now=now, window_hours=lookback_hours)

    failed = [
        FailedSubscription(
            feed_url=fs.feed_url,
            consecutive_failures=fs.consecutive_failures,
            reason=fs.deactivated_reason,
        )
        for fs in (
            (
                await session.execute(
                    select(FeedSubscription).where(FeedSubscription.consecutive_failures > 0)
                )
            )
            .scalars()
            .all()
        )
    ]

    return DigestContext(
        generated_at=now,
        period_start=start_at,
        period_end=now,
        lookback_hours=lookback_hours,
        total_headlines=total,
        duplicates_suppressed=duplicates,
        interests=sections,
        rising_interests=rising,
        exclusives=exclusives,
        failed_subscriptions=failed,
    )


async def _rising_interests(
    session: AsyncSession, interests: list[Watchlist], *, now: dt.datetime, window_hours: int
) -> list[RisingInterest]:
    """Top-3 fastest-rising interests, reusing signals/trends.py per interest."""

    scored: list[RisingInterest] = []
    for interest in interests:
        try:
            trends = await detect_trends(
                session, interest.id, now=now, window_hours=max(1, window_hours)
            )
        except Exception:  # noqa: BLE001 - a trend miss must never fail the digest
            trends = []
        if not trends:
            continue
        best = max(trends, key=lambda t: t.lift)
        scored.append(
            RisingInterest(interest_name=interest.name, lift=best.lift, top_term=best.term)
        )
    scored.sort(key=lambda r: r.lift, reverse=True)
    return scored[:3]
