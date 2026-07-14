"""Report writing: JSON, HTML, Markdown, timeline CSV, and verdict banner."""

from __future__ import annotations

from pathlib import Path

from ..models import ScanResult
from .renderers import render_html, render_json, render_markdown, render_timeline_csv
from .verdict import render_verdict_banner, verdict_style

__all__ = [
    "write_all_reports",
    "render_html",
    "render_json",
    "render_markdown",
    "render_timeline_csv",
    "render_verdict_banner",
    "verdict_style",
]


def write_all_reports(result: ScanResult, output_dir: Path) -> dict[str, Path]:
    """Write all four report files into ``output_dir``; return their paths."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / "detections.json",
        "html": output_dir / "report.html",
        "md": output_dir / "report.md",
        "csv": output_dir / "timeline.csv",
    }
    paths["json"].write_text(render_json(result))
    paths["html"].write_text(render_html(result))
    paths["md"].write_text(render_markdown(result))
    paths["csv"].write_text(render_timeline_csv(result))
    return paths
