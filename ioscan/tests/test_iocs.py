"""Phase 3: IOC engine tests."""

from __future__ import annotations

from pathlib import Path

import factories as f

from ioscan.iocs import load_iocs, summarize_iocs
from ioscan.models import Severity
from ioscan.scanner import scan_backup

SAMPLE_IOCS = Path(__file__).resolve().parent.parent / "ioscan" / "data" / "sample_iocs.stix2"


def test_loader_summary():
    bundle = load_iocs([SAMPLE_IOCS])
    summary = summarize_iocs(bundle)
    assert summary["total"] >= 4
    assert "domain" in summary["by_type"]
    assert "process" in summary["by_type"]


def _seeded_backup(tmp_path):
    datausage = f.build_datausage_db(
        [
            {"name": "BackupAgentX", "first_unix": 1_700_000_000, "wwan_in": 999, "wwan_out": 999},
            {"name": "assistantd", "first_unix": 1_700_000_050},
        ]
    )
    history = f.build_safari_history_db(
        [{"url": "https://evil-c2.example/payload", "visit_unix": 1_700_000_200}]
    )
    files = {
        (f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): datausage,
        (f.DOMAIN_SAFARI, "Library/Safari/History.db"): history,
    }
    return f.build_unencrypted_backup(tmp_path / "bk", files)


DOMAIN_IOC_ID = "indicator--11111111-1111-4111-8111-111111111111"
PROCESS_IOC_ID = "indicator--22222222-2222-4222-8222-222222222222"


def test_known_bad_domain_and_process(tmp_path):
    root = _seeded_backup(tmp_path)
    result = scan_backup(root, [SAMPLE_IOCS])
    high = [d for d in result.detections if d.severity == Severity.HIGH]
    proc_hits = [d for d in high if d.ioc_id == PROCESS_IOC_ID]
    domain_hits = [d for d in high if d.ioc_id == DOMAIN_IOC_ID]
    assert len(proc_hits) == 1, proc_hits
    assert len(domain_hits) == 1, domain_hits
    assert result.verdict == "Compromise indicators found"


def test_clean_backup_zero_detections(tmp_path):
    datausage = f.build_datausage_db(
        [{"name": "assistantd", "first_unix": 1_700_000_000, "wwan_in": 1, "wwan_out": 1}]
    )
    history = f.build_safari_history_db(
        [{"url": "https://www.apple.com/", "visit_unix": 1_700_000_200}]
    )
    files = {
        (f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): datausage,
        (f.DOMAIN_SAFARI, "Library/Safari/History.db"): history,
    }
    root = f.build_unencrypted_backup(tmp_path / "clean", files)
    result = scan_backup(root, [SAMPLE_IOCS])
    assert result.detections == []
    assert result.verdict == "Clean"
