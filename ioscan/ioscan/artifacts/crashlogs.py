"""DiagnosticReports crash logs (.ips) and JetsamEvent extractor.

Crash reports name the process that crashed and the fault signature. Repeated
crashes in security-sensitive processes (WebKit, assetsd, mediaserverd,
IMTransferAgent) are a classic exploitation footprint; heuristics later score
these. JetsamEvent reports list processes killed under memory pressure and can
reveal hidden background agents.

# TODO(verify-schema): modern .ips reports are two concatenated JSON objects
# (a header line followed by a body). Field names (bug_type, procName,
# proc_name) verified against public samples; confirm against live device logs.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from ..models import Record
from ..timeutil import parse_iso
from .base import ExtractionContext, register_extractor


def parse_ips(text: str) -> tuple[dict, dict]:
    """Parse a modern .ips report into (header, body) dicts. Lenient."""
    text = text.strip()
    if not text:
        return {}, {}
    lines = text.split("\n", 1)
    header: dict = {}
    body: dict = {}
    try:
        header = json.loads(lines[0])
    except (json.JSONDecodeError, ValueError):
        # Maybe the whole file is a single JSON document.
        try:
            body = json.loads(text)
            return {}, body
        except (json.JSONDecodeError, ValueError):
            return {}, {}
    if len(lines) > 1:
        try:
            body = json.loads(lines[1])
        except (json.JSONDecodeError, ValueError):
            body = {}
    return header, body


def _record_from_ips(source: str, text: str) -> Record | None:
    header, body = parse_ips(text)
    if not header and not body:
        return None
    proc = (
        body.get("procName")
        or body.get("proc_name")
        or header.get("app_name")
        or header.get("name")
        or header.get("process")
    )
    bug_type = header.get("bug_type") or body.get("bug_type")
    ts = parse_iso(header.get("timestamp") or header.get("captureTime"))
    is_jetsam = "jetsam" in source.lower() or bug_type in {"298", "jetsam"}
    jetsam_procs = []
    if is_jetsam:
        for item in body.get("memoryStatus", {}).get("processList", []) or []:
            name = item.get("name") or item.get("procName")
            if name:
                jetsam_procs.append(name)
    return Record(
        type="jetsam_event" if is_jetsam else "crash_report",
        timestamp=ts,
        source_file=source,
        raw={
            "process": proc,
            "bug_type": bug_type,
            "os_version": header.get("os_version"),
            "incident_id": header.get("incident_id"),
            "termination": body.get("termination"),
            "jetsam_processes": jetsam_procs,
        },
    )


@register_extractor
class CrashLogExtractor:
    name = "crashlogs"
    scan_types = ("backup", "sysdiagnose")

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        if ctx.backup is not None:
            for _domain, rel, path in ctx.find_files_global(".ips"):
                rec = self._safe_parse(rel, path)
                if rec is not None:
                    yield rec
        if ctx.fs_root is not None:
            for path in ctx.glob("**/*.ips"):
                rec = self._safe_parse(str(path.relative_to(ctx.fs_root)), path)
                if rec is not None:
                    yield rec

    @staticmethod
    def _safe_parse(source: str, path: Path) -> Record | None:
        try:
            text = path.read_text(errors="replace")
        except OSError:
            return None
        return _record_from_ips(source, text)
