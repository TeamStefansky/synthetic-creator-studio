"""Phase 5: sysdiagnose scan tests."""

from __future__ import annotations

from pathlib import Path

import factories as f

from ioscan.models import Severity
from ioscan.scanner import scan_sysdiagnose

SAMPLE_IOCS = Path(__file__).resolve().parent.parent / "ioscan" / "data" / "sample_iocs.stix2"


def test_shutdown_sticky_process_detection(tmp_path):
    root = f.build_sysdiagnose(
        tmp_path / "sysd",
        shutdown_log=f.shutdown_log_sticky("/private/var/db/com.apple.xpc.roleaccountd", repeats=3),
    )
    result = scan_sysdiagnose(root, [])
    sticky = [d for d in result.detections if d.rule == "sticky_shutdown_process"]
    assert sticky, result.detections
    assert sticky[0].severity >= Severity.MEDIUM
    assert result.verdict in {"Suspicious", "Compromise indicators found"}


def test_sysdiagnose_ioc_process_match(tmp_path):
    root = f.build_sysdiagnose(
        tmp_path / "sysd",
        ps_txt="USER PID %CPU COMMAND\nroot 42 0.0 /usr/local/bin/BackupAgentX\n",
    )
    result = scan_sysdiagnose(root, [SAMPLE_IOCS])
    proc_hits = [
        d
        for d in result.detections
        if d.matched_value == "/usr/local/bin/BackupAgentX"
        or "BackupAgentX" in str(d.matched_value)
    ]
    assert proc_hits


def test_sysdiagnose_clean(tmp_path):
    root = f.build_sysdiagnose(
        tmp_path / "sysd",
        shutdown_log=f.shutdown_log_clean(),
        ps_txt=(
            "USER PID %CPU COMMAND\nroot 1 0.0 /sbin/launchd\nroot 2 0.0 /usr/sbin/mediaserverd\n"
        ),
    )
    result = scan_sysdiagnose(root, [SAMPLE_IOCS])
    high_med = [d for d in result.detections if d.severity >= Severity.MEDIUM]
    assert high_med == [], high_med
    assert result.verdict == "Clean"
