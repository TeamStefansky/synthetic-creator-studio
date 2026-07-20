"""Automated end-to-end check by orchestrating Amnesty's MVT under the hood.

Rationale: decrypting *real* encrypted iOS backups and maintaining live spyware
IOC feeds is exactly what Amnesty International's MVT does well and safely. Rather
than reimplement fragile backup cryptography, the "Check My iPhone" flow drives
MVT for the heavy lifting — decrypt → download indicators → check-backup — and
then interprets MVT's output into a single, honest verdict.

Everything here is read-only and offline except the explicit indicator download
step. MVT is located from the current venv, a sibling ``~/mvt-venv``, or PATH.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

Progress = Callable[[str], None]


def find_mvt_ios() -> str | None:
    """Locate the ``mvt-ios`` executable: same venv, ~/mvt-venv, then PATH."""
    candidates = [
        Path(sys.executable).parent / "mvt-ios",
        Path.home() / "mvt-venv" / "bin" / "mvt-ios",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return shutil.which("mvt-ios")


class MvtError(RuntimeError):
    """Raised when an MVT step fails (e.g. wrong password, MVT missing)."""


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------


@dataclass
class MvtFinding:
    module: str
    level: str
    message: str
    matched_indicator: object  # None when informational-only
    event_time: str | None = None

    @property
    def is_indicator_match(self) -> bool:
        """A real match against a known spyware indicator."""
        return self.matched_indicator is not None

    @property
    def is_notable(self) -> bool:
        """Higher-severity heuristic even without a named indicator."""
        return (self.level or "").upper() in {"HIGH", "CRITICAL", "WARNING"}


@dataclass
class MvtResult:
    findings: list[MvtFinding] = field(default_factory=list)
    results_dir: Path | None = None
    modules_run: int = 0

    @property
    def indicator_matches(self) -> list[MvtFinding]:
        return [f for f in self.findings if f.is_indicator_match]

    @property
    def notable(self) -> list[MvtFinding]:
        return [f for f in self.findings if f.is_notable and not f.is_indicator_match]

    @property
    def informational(self) -> list[MvtFinding]:
        return [f for f in self.findings if not f.is_indicator_match and not f.is_notable]

    @property
    def verdict(self) -> str:
        if self.indicator_matches:
            return "Spyware indicators matched"
        if self.notable:
            return "Notable events — review"
        return "Clean"


def parse_results(results_dir: Path) -> MvtResult:
    """Parse MVT's ``*_detected.json`` files into a single classified result.

    MVT writes every check module's hits to ``<module>_detected.json``. Crucially,
    it also lists purely informational events (e.g. routine carrier-profile
    install/remove) with ``matched_indicator: null`` — those are NOT spyware. We
    separate genuine indicator matches from informational noise.
    """
    result = MvtResult(results_dir=results_dir)
    if not results_dir.exists():
        return result

    for detected in sorted(results_dir.glob("*_detected.json")):
        module = detected.stem.replace("_detected", "")
        result.modules_run += 1
        try:
            data = json.loads(detected.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        entries = data if isinstance(data, list) else [data]
        for e in entries:
            if not isinstance(e, dict):
                continue
            result.findings.append(
                MvtFinding(
                    module=e.get("module", module),
                    level=str(e.get("level", "")),
                    message=str(e.get("message", "")),
                    matched_indicator=e.get("matched_indicator"),
                    event_time=e.get("event_time") or e.get("timestamp"),
                )
            )
    return result


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def _run(cmd: list[str], progress: Progress, *, allow_fail: bool = False) -> int:
    """Run a subprocess, streaming its output to `progress`. Raises on failure
    unless allow_fail is set."""
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError as exc:
        raise MvtError(f"Command not found: {cmd[0]}") from exc

    assert proc.stdout is not None
    tail: list[str] = []
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            tail.append(line)
            if len(tail) > 8:
                tail.pop(0)
            progress(line)
    code = proc.wait()
    if code != 0 and not allow_fail:
        raise MvtError("\n".join(tail[-6:]) or f"exit code {code}")
    return code


def run_full_check(
    backup_path: Path,
    password: str | None,
    work_dir: Path,
    progress: Progress = lambda _m: None,
    *,
    download_iocs: bool = True,
) -> MvtResult:
    """Decrypt (if a password is given), refresh indicators, and check-backup.

    Returns a parsed, classified :class:`MvtResult`. The decrypted copy and MVT
    result files are written under ``work_dir``.
    """
    mvt = find_mvt_ios()
    if not mvt:
        raise MvtError(
            "MVT is not installed. Install it once with:\n"
            "  python3 -m venv ~/mvt-venv && ~/mvt-venv/bin/pip install mvt"
        )

    decrypted = work_dir / "decrypted"
    results = work_dir / "results"
    # Start clean — MVT requires a fresh output directory.
    for d in (decrypted, results):
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    scan_target = backup_path

    if password:
        progress("Decrypting backup (this can take a few minutes)…")
        try:
            _run(
                [mvt, "decrypt-backup", "-p", password, "-d", str(decrypted), str(backup_path)],
                progress,
            )
        except MvtError as exc:
            raise MvtError(
                "Could not decrypt the backup. The most likely cause is a wrong "
                "backup password.\n" + str(exc)
            ) from exc
        scan_target = decrypted

    if download_iocs:
        progress("Downloading the latest spyware indicators…")
        # Network hiccups shouldn't abort the whole scan; check-backup will use
        # whatever indicators are already present.
        _run([mvt, "download-iocs"], progress, allow_fail=True)

    progress("Scanning the backup against spyware indicators…")
    _run([mvt, "check-backup", "--output", str(results), str(scan_target)], progress)

    parsed = parse_results(results)
    progress(f"Done. {parsed.verdict}.")
    return parsed
