"""TCC.db extractor - privacy permission grants.

TCC.db records which app was granted access to sensitive services (camera,
microphone, location, full-disk, etc.). Unexpected grants to unknown clients
are a strong stalkerware signal, and the client bundle ids are matched against
bundle-id IOCs.

# TODO(verify-schema): TCC.db 'access' table columns (service, client,
# client_type, auth_value/allowed, last_modified) verified against MVT; older
# iOS versions use 'allowed' instead of 'auth_value'. Confirm on target device.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..models import Record
from ..timeutil import from_unix
from .base import ExtractionContext, open_sqlite_ro, register_extractor, safe_columns, table_exists

TCC_DOMAIN = "HomeDomain"
TCC_PATH = "Library/TCC/TCC.db"


@register_extractor
class TccExtractor:
    name = "tcc"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        path = ctx.get_file(TCC_DOMAIN, TCC_PATH)
        if path is None:
            return
        conn = open_sqlite_ro(path)
        try:
            if not table_exists(conn, "access"):
                return
            cols = safe_columns(conn, "access")
            allow_col = "auth_value" if "auth_value" in cols else "allowed"
            ts_col = "last_modified" if "last_modified" in cols else None
            select = f"service, client, client_type, {allow_col} AS allowed"
            if ts_col:
                select += f", {ts_col} AS last_modified"
            for row in conn.execute(f"SELECT {select} FROM access").fetchall():
                d = dict(row)
                yield Record(
                    type="tcc_entry",
                    timestamp=from_unix(d.get("last_modified")),
                    source_file=TCC_PATH,
                    raw={
                        "service": d.get("service"),
                        "client": d.get("client"),
                        "process": d.get("client"),
                        "client_type": d.get("client_type"),
                        "allowed": d.get("allowed"),
                    },
                )
        finally:
            conn.close()
