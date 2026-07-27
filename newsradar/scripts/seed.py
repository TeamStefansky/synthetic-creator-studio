"""Idempotent seed script.

Inserts ~40 sources (major global + Israeli outlets) and one demo watchlist with
5 terms and 2 entities. Running it repeatedly does not error or create duplicates.

Usage::

    uv run python scripts/seed.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.db.models import (
    Source,
    Watchlist,
    WatchlistEntity,
    WatchlistKind,
    WatchlistTerm,
)
from newsradar.db.session import get_engine, get_sessionmaker
from newsradar.logging import configure_logging, get_logger
from newsradar.reports.digest_service import ensure_digest_schedule

log = get_logger("newsradar.seed")

# (name, domain, source_type, platform, country_code, lang, tier, credibility)
SOURCES: list[tuple[str, str, str, str | None, str | None, str | None, int, float]] = [
    # --- Global wires / tier-1 international ---
    ("Reuters", "reuters.com", "news", None, "GB", "en", 1, 0.95),
    ("Associated Press", "apnews.com", "news", None, "US", "en", 1, 0.95),
    ("Agence France-Presse", "afp.com", "news", None, "FR", "fr", 1, 0.94),
    ("Bloomberg", "bloomberg.com", "news", None, "US", "en", 1, 0.9),
    ("BBC News", "bbc.com", "news", None, "GB", "en", 1, 0.92),
    ("The New York Times", "nytimes.com", "news", None, "US", "en", 1, 0.9),
    ("The Guardian", "theguardian.com", "news", None, "GB", "en", 1, 0.88),
    ("The Washington Post", "washingtonpost.com", "news", None, "US", "en", 1, 0.88),
    ("Financial Times", "ft.com", "news", None, "GB", "en", 1, 0.9),
    ("The Wall Street Journal", "wsj.com", "news", None, "US", "en", 1, 0.9),
    ("The Economist", "economist.com", "news", None, "GB", "en", 1, 0.89),
    ("The Times", "thetimes.co.uk", "news", None, "GB", "en", 1, 0.87),
    ("Le Monde", "lemonde.fr", "news", None, "FR", "fr", 1, 0.88),
    ("El Pais", "elpais.com", "news", None, "ES", "es", 1, 0.86),
    ("Der Spiegel", "spiegel.de", "news", None, "DE", "de", 1, 0.87),
    # --- Global tier-2 ---
    ("CNN", "cnn.com", "news", None, "US", "en", 2, 0.8),
    ("Al Jazeera English", "aljazeera.com", "news", None, "QA", "en", 2, 0.78),
    ("Al Arabiya", "alarabiya.net", "news", None, "AE", "ar", 2, 0.75),
    ("Deutsche Welle", "dw.com", "news", None, "DE", "en", 2, 0.83),
    ("France 24", "france24.com", "news", None, "FR", "en", 2, 0.82),
    ("Politico", "politico.com", "news", None, "US", "en", 2, 0.82),
    ("Axios", "axios.com", "news", None, "US", "en", 2, 0.81),
    ("NPR", "npr.org", "news", None, "US", "en", 2, 0.85),
    ("CNBC", "cnbc.com", "news", None, "US", "en", 2, 0.8),
    ("South China Morning Post", "scmp.com", "news", None, "HK", "en", 2, 0.76),
    ("The Hindu", "thehindu.com", "news", None, "IN", "en", 2, 0.78),
    ("Kyodo News", "kyodonews.net", "news", None, "JP", "en", 2, 0.8),
    # --- Global tier-3 state media ---
    ("TASS", "tass.com", "news", None, "RU", "en", 3, 0.5),
    ("Xinhua", "xinhuanet.com", "news", None, "CN", "en", 3, 0.45),
    # --- Aggregators / social / forum ---
    ("Google News", "news.google.com", "aggregator", None, "US", "en", 3, 0.6),
    ("Reddit r/worldnews", "reddit.com", "forum", "reddit", "US", "en", 4, 0.4),
    ("X (Twitter)", "x.com", "social", "x", "US", "en", 4, 0.35),
    # --- Israeli outlets ---
    ("Haaretz (English)", "haaretz.com", "news", None, "IL", "en", 1, 0.85),
    ("Haaretz", "haaretz.co.il", "news", None, "IL", "he", 1, 0.85),
    ("The Times of Israel", "timesofisrael.com", "news", None, "IL", "en", 2, 0.83),
    ("The Jerusalem Post", "jpost.com", "news", None, "IL", "en", 2, 0.8),
    ("Ynetnews", "ynetnews.com", "news", None, "IL", "en", 2, 0.78),
    ("Ynet", "ynet.co.il", "news", None, "IL", "he", 2, 0.78),
    ("Globes", "globes.co.il", "news", None, "IL", "he", 2, 0.8),
    ("Calcalist", "calcalist.co.il", "news", None, "IL", "he", 2, 0.79),
    ("Walla", "walla.co.il", "news", None, "IL", "he", 3, 0.7),
    ("Maariv", "maariv.co.il", "news", None, "IL", "he", 3, 0.7),
    ("Israel Hayom", "israelhayom.co.il", "news", None, "IL", "he", 3, 0.68),
    ("Kan 11", "kan.org.il", "broadcast", None, "IL", "he", 2, 0.82),
    ("N12 (Mako)", "mako.co.il", "broadcast", None, "IL", "he", 2, 0.76),
    ("i24NEWS", "i24news.tv", "broadcast", None, "IL", "en", 2, 0.75),
    ("Arutz Sheva", "israelnationalnews.com", "news", None, "IL", "en", 3, 0.6),
]

WATCHLIST_NAME = "Demo: Israel Tech & Security"

# (term, term_type, lang, is_exclusion, weight)
TERMS: list[tuple[str, str, str | None, bool, float]] = [
    ("cybersecurity", "keyword", "en", False, 1.0),
    ("בינה מלאכותית", "keyword", "he", False, 1.0),
    ("Iron Dome", "phrase", "en", False, 1.5),
    ("startup nation", "phrase", "en", False, 1.0),
    ("סייבר", "keyword", "he", False, 1.2),
]

# (name, entity_type, aliases, is_primary)
ENTITIES: list[tuple[str, str, list[str], bool]] = [
    ("Benjamin Netanyahu", "person", ["Bibi", "בנימין נתניהו", "Netanyahu"], True),
    ("Check Point Software", "org", ["Check Point", "צ'ק פוינט"], False),
]


async def _seed_sources(session: AsyncSession) -> None:
    rows = [
        {
            "name": name,
            "domain": domain,
            "source_type": stype,
            "platform": platform,
            "country_code": country,
            "lang": lang,
            "tier": tier,
            "credibility_score": cred,
        }
        for (name, domain, stype, platform, country, lang, tier, cred) in SOURCES
    ]
    stmt = pg_insert(Source).values(rows).on_conflict_do_nothing(index_elements=["domain"])
    await session.execute(stmt)


async def _seed_watchlist(session: AsyncSession) -> None:
    await session.execute(
        pg_insert(Watchlist)
        .values(
            name=WATCHLIST_NAME,
            description="Demo watchlist: Israeli technology and security coverage.",
            lang_filter=["he", "en", "ar"],
            country_filter=["IL"],
        )
        .on_conflict_do_nothing(index_elements=["name"])
    )
    watchlist_id = (
        await session.execute(select(Watchlist.id).where(Watchlist.name == WATCHLIST_NAME))
    ).scalar_one()

    term_rows = [
        {
            "watchlist_id": watchlist_id,
            "term": term,
            "term_type": ttype,
            "lang": lang,
            "is_exclusion": is_excl,
            "weight": weight,
        }
        for (term, ttype, lang, is_excl, weight) in TERMS
    ]
    await session.execute(
        pg_insert(WatchlistTerm)
        .values(term_rows)
        .on_conflict_do_nothing(index_elements=["watchlist_id", "term", "lang"])
    )

    # watchlist_entities has no unique constraint; guard idempotency manually.
    existing = set(
        (
            await session.execute(
                select(WatchlistEntity.name).where(WatchlistEntity.watchlist_id == watchlist_id)
            )
        )
        .scalars()
        .all()
    )
    new_entities = [
        {
            "watchlist_id": watchlist_id,
            "name": name,
            "entity_type": etype,
            "aliases": aliases,
            "is_primary": is_primary,
        }
        for (name, etype, aliases, is_primary) in ENTITIES
        if name not in existing
    ]
    if new_entities:
        await session.execute(pg_insert(WatchlistEntity).values(new_entities))


async def _seed_digest_schedule(session: AsyncSession) -> None:
    """Ensure a default reader interest exists and seed the 07:00 digest schedule."""

    interest = (
        await session.execute(
            select(Watchlist).where(Watchlist.kind == WatchlistKind.interest).limit(1)
        )
    ).scalar_one_or_none()
    if interest is None:
        interest = Watchlist(
            name="World news (default interest)",
            description="Default reader interest seeded for the headline digest.",
            kind=WatchlistKind.interest,
        )
        session.add(interest)
        await session.commit()
    await ensure_digest_schedule(session, watchlist_id=interest.id)


async def main() -> None:
    configure_logging()
    factory = get_sessionmaker()
    async with factory() as session:
        await _seed_sources(session)
        await _seed_watchlist(session)
        await session.commit()
        await _seed_digest_schedule(session)

        source_count = (await session.execute(select(Source.id))).scalars().all()
        term_count = (await session.execute(select(WatchlistTerm.id))).scalars().all()
        entity_count = (await session.execute(select(WatchlistEntity.id))).scalars().all()

    await get_engine().dispose()
    log.info(
        "newsradar.seed.done",
        sources=len(source_count),
        watchlists=1,
        terms=len(term_count),
        entities=len(entity_count),
    )


if __name__ == "__main__":
    asyncio.run(main())
