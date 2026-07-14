"""Safari History.db and WebKit ResourceLoadStatistics extractors.

Browsing history and the set of observed third-party domains are matched
against URL/domain IOCs (many iOS exploit chains begin with a malicious
Safari visit).

# TODO(verify-schema): History.db (history_items/history_visits, visit_time in
# Cocoa epoch) and ResourceLoadStatistics observations.db (ObservedDomains,
# registrableDomain) mirror the schemas used by MVT; confirm against a live
# device before production use.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..models import Record
from ..timeutil import from_cocoa
from .base import ExtractionContext, open_sqlite_ro, register_extractor, table_exists

SAFARI_DOMAIN = "AppDomain-com.apple.mobilesafari"
HISTORY_PATH = "Library/Safari/History.db"
RLS_PATH = "Library/WebKit/WebsiteData/ResourceLoadStatistics/observations.db"


@register_extractor
class SafariHistoryExtractor:
    name = "safari_history"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        path = ctx.get_file(SAFARI_DOMAIN, HISTORY_PATH)
        if path is None:
            return
        conn = open_sqlite_ro(path)
        try:
            if not (table_exists(conn, "history_items") and table_exists(conn, "history_visits")):
                return
            rows = conn.execute(
                "SELECT i.url AS url, i.visit_count AS visit_count, "
                "v.visit_time AS visit_time, v.title AS title "
                "FROM history_items i "
                "JOIN history_visits v ON v.history_item = i.id"
            ).fetchall()
            for row in rows:
                d = dict(row)
                yield Record(
                    type="safari_history",
                    timestamp=from_cocoa(d.get("visit_time")),
                    source_file=HISTORY_PATH,
                    raw={
                        "url": d.get("url"),
                        "title": d.get("title"),
                        "visit_count": d.get("visit_count"),
                    },
                )
        finally:
            conn.close()


@register_extractor
class WebKitResourceStatsExtractor:
    name = "webkit_resource_stats"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        path = ctx.get_file(SAFARI_DOMAIN, RLS_PATH)
        if path is None:
            return
        conn = open_sqlite_ro(path)
        try:
            if not table_exists(conn, "ObservedDomains"):
                return
            rows = conn.execute("SELECT registrableDomain FROM ObservedDomains").fetchall()
            for row in rows:
                domain = row["registrableDomain"]
                if not domain:
                    continue
                yield Record(
                    type="webkit_observed_domain",
                    timestamp=None,
                    source_file=RLS_PATH,
                    raw={"domain": domain},
                )
        finally:
            conn.close()
