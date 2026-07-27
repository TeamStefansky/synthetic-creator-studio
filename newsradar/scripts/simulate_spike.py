"""Force a heat spike and prove a critical alert fires and dispatches to Slack.

Usage::

    uv run python scripts/simulate_spike.py --watchlist demo

Seeds a burst of documents onto an event in the named watchlist (creating the
watchlist if needed), spins up a local HTTP webhook catcher, runs one signal
cycle pointed at it, and reports the alerts that fired and whether a Slack payload
was delivered. Running it twice within the cooldown produces exactly one alert.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

from sqlalchemy import select

from newsradar.config import Settings
from newsradar.db.models import (
    Document,
    DocumentMatch,
    Event,
    EventDocument,
    Source,
    Watchlist,
)
from newsradar.db.session import get_sessionmaker
from newsradar.signals.metrics import run_signal_cycle

_CAUGHT: list[dict[str, object]] = []


class _Catcher(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            _CAUGHT.append(json.loads(body))
        except json.JSONDecodeError:
            _CAUGHT.append({"raw": body.decode("utf-8", "replace")})
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args: object) -> None:  # silence access logs
        return


def _start_catcher() -> tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _Catcher)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    return server, f"http://{host}:{port}/webhook"


async def _get_or_create_watchlist(session, name: str) -> Watchlist:  # type: ignore[no-untyped-def]
    wl = (
        await session.execute(select(Watchlist).where(Watchlist.name == name))
    ).scalar_one_or_none()
    if wl is None:
        wl = Watchlist(name=name)
        session.add(wl)
        await session.flush()
    return wl


_SIM_TITLE = "Simulated spike (demo)"


async def _seed_spike(session, watchlist: Watchlist, now: dt.datetime) -> Event:  # type: ignore[no-untyped-def]
    # Reuse a single simulated event per watchlist so the per-event cooldown is
    # exercised: a second run within the cooldown must NOT re-fire.
    event = (
        await session.execute(
            select(Event).where(Event.watchlist_id == watchlist.id, Event.title == _SIM_TITLE)
        )
    ).scalar_one_or_none()
    if event is None:
        event = Event(
            watchlist_id=watchlist.id,
            title=_SIM_TITLE,
            status="active",
            first_seen_at=now - dt.timedelta(hours=8),
            last_seen_at=now,
        )
        session.add(event)
    else:
        event.last_seen_at = now
    await session.flush()

    async def _src(domain: str, tier: int, stype: str) -> Source:
        src = Source(
            name=domain, domain=domain, source_type=stype, tier=tier, credibility_score=0.7
        )
        session.add(src)
        await session.flush()
        return src

    async def _doc(src: Source, published_at: dt.datetime) -> None:
        slug = uuid.uuid4().hex[:12]
        doc = Document(
            source_id=src.id,
            url=f"https://{src.domain}/{slug}",
            canonical_url=f"https://{src.domain}/{slug}",
            url_hash=uuid.uuid4().hex + uuid.uuid4().hex,
            title="Simulated burst document",
            media_type="article",
            published_at=published_at,
            fetched_at=published_at,
        )
        session.add(doc)
        await session.flush()
        session.add(
            DocumentMatch(document_id=doc.id, watchlist_id=watchlist.id, matched_terms=["x"])
        )
        session.add(EventDocument(event_id=event.id, document_id=doc.id, added_at=published_at))

    tag = uuid.uuid4().hex[:6]  # unique source domains per run
    warm = await _src(f"warm-{tag}.example", 2, "news")
    for h in range(7, 0, -1):
        await _doc(warm, now - dt.timedelta(hours=h))
    for i in range(20):
        src = await _src(
            f"burst{i}-{tag}.example", 1 if i % 3 == 0 else 2, "social" if i % 2 else "news"
        )
        await _doc(src, now - dt.timedelta(minutes=3))

    await session.commit()
    return event


async def _run(watchlist_name: str) -> int:
    now = dt.datetime.now(dt.UTC)
    server, url = _start_catcher()
    try:
        factory = get_sessionmaker()
        async with factory() as session:
            wl = await _get_or_create_watchlist(session, watchlist_name)
            await _seed_spike(session, wl, now)
            settings = Settings(slack_webhook_url=url)
            result = await run_signal_cycle(session, wl.id, now=now, settings=settings)

            top = (
                await session.execute(
                    select(Event.title, Event.heat_score)
                    .where(Event.watchlist_id == wl.id)
                    .order_by(Event.heat_score.desc())
                    .limit(5)
                )
            ).all()
    finally:
        server.shutdown()

    print(f"metrics written : {result.metrics_written}")
    print(f"alerts fired    : {result.alerts_fired}")
    print(f"deliveries      : {[(o.channel, o.status) for o in result.deliveries]}")
    print(f"slack payloads  : {len(_CAUGHT)} caught")
    print("top events by heat:")
    for title, heat in top:
        print(f"  {heat:6.2f}  {title}")

    critical = "heat_spike" in result.alerts_fired
    delivered = any(o.status == "sent" for o in result.deliveries)
    if not critical:
        print("FAIL: no heat_spike alert fired")
        return 1
    if not delivered or not _CAUGHT:
        print("FAIL: no Slack payload dispatched")
        return 1
    print("OK: critical heat_spike alert fired and Slack payload dispatched")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Simulate a heat spike and check alerting.")
    parser.add_argument("--watchlist", default="demo")
    args = parser.parse_args(argv)
    return asyncio.run(_run(args.watchlist))


if __name__ == "__main__":
    raise SystemExit(main())
