"""Geographic hot zones: H3 res-4 aggregation and the 3σ trailing-14d rule."""

from __future__ import annotations

import datetime as dt
import uuid

import h3
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from newsradar.signals import weights as w
from newsradar.signals.geo import GeoDoc, compute_hot_zones, hot_zones
from tests.signals import _factories as f

NOW = dt.datetime(2026, 7, 27, 12, 0, tzinfo=dt.UTC)

# Tel Aviv vs a faraway quiet point.
TLV = (32.0853, 34.7818)
OSLO = (59.9139, 10.7522)


def _doc(latlon: tuple[float, float], hours_ago: float, *, cc: str, ev: uuid.UUID | None) -> GeoDoc:
    return GeoDoc(
        lat=latlon[0],
        lon=latlon[1],
        country_code=cc,
        published_at=NOW - dt.timedelta(hours=hours_ago),
        event_id=ev,
    )


def test_burst_zone_is_hot_quiet_zone_is_not() -> None:
    ev = uuid.UUID(int=7)
    docs: list[GeoDoc] = []
    # Tel Aviv: a burst of 6 docs in the trailing 6h, essentially nothing before.
    for _ in range(6):
        docs.append(_doc(TLV, 1.0, cc="IL", ev=ev))
    # Oslo: a steady low background over the 14 days, nothing anomalous now.
    for day in range(14):
        docs.append(_doc(OSLO, day * 24 + 12, cc="NO", ev=None))

    zones = compute_hot_zones(docs, now=NOW)
    assert len(zones) == 1
    hot = zones[0]
    assert hot.h3 == h3.latlng_to_cell(*TLV, w.H3_RESOLUTION)
    assert hot.country_code == "IL"
    assert hot.doc_count == 6
    assert hot.z >= w.GEO_HOT_Z
    assert hot.top_event_ids == [ev]


def test_below_min_count_never_hot() -> None:
    # Two docs in the trailing window is below the absolute floor.
    docs = [_doc(TLV, 1.0, cc="IL", ev=None), _doc(TLV, 2.0, cc="IL", ev=None)]
    assert compute_hot_zones(docs, now=NOW) == []


@pytest.mark.asyncio
async def test_hot_zones_db(session: AsyncSession) -> None:
    await f.reset(session)
    src = await f.make_source(session, "a.com")
    wl = await f.make_watchlist(session)
    ev = await f.make_event(session, wl)

    for _ in range(5):
        d = await f.make_document(session, src, published_at=NOW - dt.timedelta(hours=1))
        await f.add_match(session, d, wl, ["x"])
        await f.link_doc(session, ev, d)
        await f.add_enrichment(
            session,
            d,
            geo={"lat": TLV[0], "lon": TLV[1], "country_code": "IL"},
        )
    await session.commit()

    zones = await hot_zones(session, wl.id, now=NOW)
    assert len(zones) == 1
    assert zones[0].country_code == "IL"
    assert zones[0].doc_count == 5
    assert ev.id in zones[0].top_event_ids
