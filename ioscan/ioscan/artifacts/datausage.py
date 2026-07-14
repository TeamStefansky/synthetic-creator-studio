"""DataUsage.sqlite / netusage.sqlite - per-process network usage.

These databases record every process that generated cellular/Wi-Fi traffic.
Spyware often appears here as an unexpected or oddly named process, so this
is one of the highest-signal artifacts for iOS stalkerware triage.

# TODO(verify-schema): column names (ZPROCESS.ZPROCNAME, ZLIVEUSAGE.ZWWANIN/
# ZWWANOUT/ZTIMESTAMP) verified against MVT's datausage module; re-confirm
# against a live iOS 16/17 DataUsage.sqlite before production use.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..models import Record
from ..timeutil import from_cocoa
from .base import ExtractionContext, open_sqlite_ro, register_extractor, safe_columns

DOMAIN = "WirelessDomain"
_PATHS = [
    "Library/Databases/DataUsage.sqlite",
    "Library/Databases/netusage.sqlite",
]

RECORD_TYPE = "network_usage"


@register_extractor
class DataUsageExtractor:
    name = "datausage"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        for rel in _PATHS:
            path = ctx.get_file(DOMAIN, rel)
            if path is None:
                continue
            yield from self._extract_db(path, rel)

    def _extract_db(self, path, rel) -> Iterator[Record]:
        conn = open_sqlite_ro(path)
        try:
            cols = safe_columns(conn, "ZPROCESS")
            if not cols:
                return
            name_col = "ZPROCNAME" if "ZPROCNAME" in cols else "ZPROCESSNAME"
            query = (
                f"SELECT p.{name_col} AS procname, p.ZBUNDLENAME AS bundle, "
                "p.ZFIRSTTIMESTAMP AS first_ts, l.ZTIMESTAMP AS ts, "
                "l.ZWWANIN AS wwan_in, l.ZWWANOUT AS wwan_out "
                "FROM ZPROCESS p LEFT JOIN ZLIVEUSAGE l ON l.ZHASPROCESS = p.Z_PK"
            )
            try:
                rows = conn.execute(query).fetchall()
            except Exception:  # noqa: BLE001 - schema drift
                rows = conn.execute(
                    f"SELECT {name_col} AS procname, ZBUNDLENAME AS bundle, "
                    "ZFIRSTTIMESTAMP AS first_ts FROM ZPROCESS"
                ).fetchall()
            for row in rows:
                d = dict(row)
                ts = from_cocoa(d.get("ts") or d.get("first_ts"))
                yield Record(
                    type=RECORD_TYPE,
                    timestamp=ts,
                    source_file=rel,
                    raw={
                        "process": d.get("procname"),
                        "bundle": d.get("bundle"),
                        "wwan_in": d.get("wwan_in"),
                        "wwan_out": d.get("wwan_out"),
                        "first_seen": from_cocoa(d.get("first_ts")).isoformat()
                        if from_cocoa(d.get("first_ts"))
                        else None,
                    },
                )
        finally:
            conn.close()
