"""Verdict banner rendering."""

from __future__ import annotations

from rich.console import Console
from rich.panel import Panel

from ..models import ScanResult

_VERDICT_STYLE = {
    "Clean": ("green", "[OK]"),
    "Suspicious": ("yellow", "[!]"),
    "Compromise indicators found": ("red", "[!!]"),
}


def verdict_style(verdict: str) -> tuple[str, str]:
    return _VERDICT_STYLE.get(verdict, ("white", "[?]"))


def render_verdict_banner(result: ScanResult, console: Console) -> None:
    verdict = result.verdict
    color, marker = verdict_style(verdict)
    n = len(result.detections)
    body = (
        f"{marker} Verdict: [bold]{verdict}[/bold]\n"
        f"Detections: {n}   Records analyzed: {len(result.records)}   "
        f"Target: {result.target}"
    )
    console.print(Panel(body, border_style=color, title="ioscan"))
