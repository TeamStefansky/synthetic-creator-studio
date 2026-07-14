"""Report renderers: JSON, HTML, Markdown, and a merged timeline CSV."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .. import CONSENT_NOTICE
from ..models import ScanResult
from ..timeutil import to_iso

_TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "htm", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_json(result: ScanResult) -> str:
    return json.dumps(result.to_dict(), indent=2, sort_keys=False)


def _verdict_class(verdict: str) -> str:
    return {
        "Clean": "clean",
        "Suspicious": "suspicious",
        "Compromise indicators found": "compromise",
    }.get(verdict, "suspicious")


def render_html(result: ScanResult) -> str:
    template = _env().get_template("report.html.j2")
    return template.render(
        result=result,
        detections=result.sorted_detections(),
        verdict_class=_verdict_class(result.verdict),
        started=to_iso(result.started_at) or "",
        finished=to_iso(result.finished_at) or "",
        consent=CONSENT_NOTICE,
    )


def render_markdown(result: ScanResult) -> str:
    template = _env().get_template("report.md.j2")
    return template.render(
        result=result,
        detections=result.sorted_detections(),
        started=to_iso(result.started_at) or "",
        finished=to_iso(result.finished_at) or "",
        consent=CONSENT_NOTICE,
    )


def render_timeline_csv(result: ScanResult) -> str:
    """Merge every timestamped record and detection into one sorted timeline."""
    rows: list[dict] = []
    detection_keys = {(d.source, d.record_type, to_iso(d.timestamp)) for d in result.detections}
    for det in result.detections:
        if det.timestamp is None:
            continue
        rows.append(
            {
                "timestamp": to_iso(det.timestamp),
                "kind": "detection",
                "severity": det.severity.name,
                "type": det.record_type or "",
                "source_file": det.source,
                "detail": f"{det.description}: {det.matched_value}",
            }
        )
    for rec in result.records:
        if rec.timestamp is None:
            continue
        key = (rec.source_file, rec.type, to_iso(rec.timestamp))
        rows.append(
            {
                "timestamp": to_iso(rec.timestamp),
                "kind": "event",
                "severity": "MATCH" if key in detection_keys else "",
                "type": rec.type,
                "source_file": rec.source_file,
                "detail": _record_summary(rec),
            }
        )
    rows.sort(key=lambda r: r["timestamp"] or "")

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf, fieldnames=["timestamp", "kind", "severity", "type", "source_file", "detail"]
    )
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def _record_summary(rec) -> str:  # noqa: ANN001
    raw = rec.raw
    for key in ("process", "url", "domain", "text", "identifier", "path", "service"):
        if raw.get(key):
            return f"{key}={raw[key]}"
    return rec.type
