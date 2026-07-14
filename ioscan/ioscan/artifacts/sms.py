"""sms.db - iMessage/SMS messages and their links.

Message bodies and sender handles are scanned for URL/domain IOCs; several
mercenary-spyware chains have used a zero-click iMessage link as the entry
point.

# TODO(verify-schema): sms.db 'message' (text, date, handle_id, is_from_me,
# service) and 'handle' (id) tables verified against MVT. Modern iOS stores
# 'date' as nanoseconds since the 2001 epoch; older devices use seconds. The
# extractor auto-detects magnitude.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from ..models import Record
from ..timeutil import from_cocoa
from .base import ExtractionContext, open_sqlite_ro, register_extractor, table_exists

SMS_DOMAIN = "HomeDomain"
SMS_PATH = "Library/SMS/sms.db"

_URL_RE = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
# Threshold above which a 2001-epoch value is nanoseconds rather than seconds.
_NANO_THRESHOLD = 1_000_000_000_000


def _normalize_mac_date(value):
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if abs(v) > _NANO_THRESHOLD:
        v = v / 1_000_000_000.0
    return from_cocoa(v)


@register_extractor
class SmsExtractor:
    name = "sms"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        path = ctx.get_file(SMS_DOMAIN, SMS_PATH)
        if path is None:
            return
        conn = open_sqlite_ro(path)
        try:
            if not table_exists(conn, "message"):
                return
            query = (
                "SELECT m.ROWID AS rowid, m.text AS text, m.date AS date, "
                "m.is_from_me AS is_from_me, m.service AS service, h.id AS handle "
                "FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID"
            )
            try:
                rows = conn.execute(query).fetchall()
            except Exception:  # noqa: BLE001
                rows = conn.execute("SELECT ROWID AS rowid, text, date FROM message").fetchall()
            for row in rows:
                d = dict(row)
                text = d.get("text") or ""
                links = _URL_RE.findall(text)
                yield Record(
                    type="sms_message",
                    timestamp=_normalize_mac_date(d.get("date")),
                    source_file=SMS_PATH,
                    raw={
                        "text": text,
                        "handle": d.get("handle"),
                        "service": d.get("service"),
                        "is_from_me": d.get("is_from_me"),
                        "links": links,
                    },
                )
        finally:
            conn.close()
