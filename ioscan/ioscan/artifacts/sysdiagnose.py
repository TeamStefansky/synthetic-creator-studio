"""sysdiagnose-only extractors: shutdown.log and process listings.

The shutdown.log analysis implements the "Triangulation" technique: a process
that repeatedly delays unmount of the data volume across multiple shutdowns
(appearing again and again as a "remaining client") is a strong indicator of a
persistent implant.

# TODO(verify-schema): shutdown.log line format ("remaining client pid: <pid>
# (<path>)") and ps.txt column layout verified against public sysdiagnose
# samples; confirm against a current iOS sysdiagnose before production use.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from ..models import Record
from .base import ExtractionContext, register_extractor

# Matches "remaining client pid: 861 (/path/or/name)" style entries.
_SHUTDOWN_CLIENT_RE = re.compile(r"pid:?\s*(\d+)\s*\(([^)]+)\)")


@register_extractor
class ShutdownLogExtractor:
    name = "shutdown_log"
    scan_types = ("sysdiagnose",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        paths = ctx.glob("**/shutdown.log")
        counts: dict[str, int] = {}
        for path in paths:
            try:
                text = path.read_text(errors="replace")
            except OSError:
                continue
            for _pid, client in _SHUTDOWN_CLIENT_RE.findall(text):
                client = client.strip()
                counts[client] = counts.get(client, 0) + 1
        for client, count in counts.items():
            yield Record(
                type="shutdown_process",
                timestamp=None,
                source_file="shutdown.log",
                raw={
                    "process": client,
                    "path": client if client.startswith("/") else None,
                    "count": count,
                },
            )


@register_extractor
class PsListExtractor:
    name = "ps_list"
    scan_types = ("sysdiagnose",)

    def extract(self, ctx: ExtractionContext) -> Iterator[Record]:
        for path in ctx.glob("**/ps.txt"):
            try:
                lines = path.read_text(errors="replace").splitlines()
            except OSError:
                continue
            if not lines:
                continue
            header = lines[0].lower()
            # The command is the trailing column in a `ps aux`-style dump.
            for line in lines[1:]:
                line = line.rstrip()
                if not line.strip():
                    continue
                parts = line.split(None, 10)
                if len(parts) < 2:
                    continue
                command = parts[-1] if "command" in header or "comm" in header else parts[-1]
                proc_name = command.split()[0] if command else command
                yield Record(
                    type="process_launch",
                    timestamp=None,
                    source_file="ps.txt",
                    raw={"process": proc_name, "path": proc_name, "command": command},
                )
