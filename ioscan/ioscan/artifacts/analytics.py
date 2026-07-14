"""Analytics / process-launch extractors (KnowledgeC.db, Analytics-*.core_analytics).

KnowledgeC.db records app usage / focus events; the Analytics core_analytics
files record process launches and daily aggregates. Both surface process and
bundle-id names that feed IOC matching and the suspicious-process-name
heuristic.

# TODO(verify-schema): KnowledgeC.db (ZOBJECT.ZSTREAMNAME='/app/inFocus',
# ZVALUESTRING=bundle id, ZSTARTDATE in Cocoa epoch) and the newline-delimited
# JSON core_analytics format verified against public references; confirm on a
# live device before production use.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

from ..models import Record
from ..timeutil import from_cocoa
from .base import ExtractionContext, open_sqlite_ro, register_extractor, table_exists

KNOWLEDGE_DOMAIN = "AppDomainGroup-group.com.apple.coreduet.appmonitor"
KNOWLEDGE_PATH = "Library/CoreDuet/Knowledge/knowledgeC.db"

ANALYTICS_DOMAIN = "RootDomain"


@register_extractor
class KnowledgeCExtractor:
    name = "knowledgec"
    scan_types = ("backup",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        path = ctx.get_file(KNOWLEDGE_DOMAIN, KNOWLEDGE_PATH)
        if path is None:
            return
        conn = open_sqlite_ro(path)
        try:
            if not table_exists(conn, "ZOBJECT"):
                return
            rows = conn.execute(
                "SELECT ZVALUESTRING AS bundle, ZSTREAMNAME AS stream, "
                "ZSTARTDATE AS start FROM ZOBJECT "
                "WHERE ZSTREAMNAME LIKE '/app/%'"
            ).fetchall()
            for row in rows:
                d = dict(row)
                if not d.get("bundle"):
                    continue
                yield Record(
                    type="process_launch",
                    timestamp=from_cocoa(d.get("start")),
                    source_file=KNOWLEDGE_PATH,
                    raw={
                        "process": d.get("bundle"),
                        "bundle_id": d.get("bundle"),
                        "stream": d.get("stream"),
                    },
                )
        finally:
            conn.close()


@register_extractor
class CoreAnalyticsExtractor:
    name = "core_analytics"
    scan_types = ("backup", "sysdiagnose")

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        sources: list[tuple[str, bytes]] = []
        if ctx.backup is not None:
            for _domain, rel, path in ctx.find_files_global(".core_analytics"):
                try:
                    sources.append((rel, path.read_bytes()))
                except OSError:
                    continue
        if ctx.fs_root is not None:
            for path in ctx.glob("**/*.core_analytics"):
                try:
                    sources.append((str(path.relative_to(ctx.fs_root)), path.read_bytes()))
                except OSError:
                    continue
        for rel, blob in sources:
            yield from self._parse(rel, blob)

    def _parse(self, rel: str, blob: bytes) -> Iterator[Record]:
        for line in blob.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue
            if not isinstance(obj, dict):
                continue
            proc = obj.get("processName") or obj.get("process") or obj.get("name")
            if not proc:
                continue
            yield Record(
                type="process_launch",
                timestamp=None,
                source_file=rel,
                raw={"process": proc, "message": obj.get("message")},
            )
