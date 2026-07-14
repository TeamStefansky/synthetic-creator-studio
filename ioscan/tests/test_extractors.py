"""Phase 2: core extractor tests against synthetic artifacts."""

from __future__ import annotations

import factories as f

from ioscan.artifacts import ExtractionContext, iter_extractors
from ioscan.backup import open_backup


def _run_extractor(backup_root, work_dir, name):
    with open_backup(backup_root) as bk:
        ctx = ExtractionContext(work_dir=work_dir, backup=bk)
        for ext in iter_extractors("backup"):
            if ext.name == name:
                return list(ext.extract(ctx))
    return []


def test_datausage_extractor(tmp_path):
    db = f.build_datausage_db(
        [
            {
                "name": "assistantd",
                "bundle": "com.apple.assistantd",
                "first_unix": 1_700_000_000,
                "wwan_in": 10,
                "wwan_out": 20,
                "ts_unix": 1_700_000_100,
            },
            {
                "name": "com.apple.WebKit.Networking",
                "first_unix": 1_700_000_500,
                "wwan_in": 5,
                "wwan_out": 5,
            },
        ]
    )
    root = f.build_unencrypted_backup(
        tmp_path / "bk", {(f.DOMAIN_DATAUSAGE, "Library/Databases/DataUsage.sqlite"): db}
    )
    recs = _run_extractor(root, tmp_path / "work", "datausage")
    procs = {r.raw["process"] for r in recs}
    assert "assistantd" in procs
    assert all(r.timestamp is not None and r.timestamp.tzinfo is not None for r in recs)


def test_safari_history_extractor(tmp_path):
    db = f.build_safari_history_db(
        [{"url": "https://example.com/", "title": "Example", "visit_unix": 1_700_000_000}]
    )
    root = f.build_unencrypted_backup(
        tmp_path / "bk", {(f.DOMAIN_SAFARI, "Library/Safari/History.db"): db}
    )
    recs = _run_extractor(root, tmp_path / "work", "safari_history")
    assert any(r.raw["url"] == "https://example.com/" for r in recs)


def test_webkit_rls_extractor(tmp_path):
    db = f.build_rls_db(["tracker.example", "cdn.example"])
    rel = "Library/WebKit/WebsiteData/ResourceLoadStatistics/observations.db"
    root = f.build_unencrypted_backup(tmp_path / "bk", {(f.DOMAIN_SAFARI, rel): db})
    recs = _run_extractor(root, tmp_path / "work", "webkit_resource_stats")
    domains = {r.raw["domain"] for r in recs}
    assert "tracker.example" in domains


def test_sms_extractor_links(tmp_path):
    db = f.build_sms_db(
        [
            {
                "text": "check https://bad.example/x",
                "handle": "+15551234567",
                "date_unix": 1_700_000_000,
            }
        ]
    )
    root = f.build_unencrypted_backup(tmp_path / "bk", {(f.DOMAIN_SMS, "Library/SMS/sms.db"): db})
    recs = _run_extractor(root, tmp_path / "work", "sms")
    assert recs
    assert "https://bad.example/x" in recs[0].raw["links"]
    assert recs[0].timestamp is not None


def test_crashlog_extractor(tmp_path):
    ips = f.build_ips(
        {"bug_type": "309", "timestamp": "2023-11-01 10:00:00.00 +0000", "os_version": "iOS 16.6"},
        {"procName": "WebKit.Networking", "termination": {"code": 11}},
    )
    root = f.build_unencrypted_backup(
        tmp_path / "bk",
        {("RootDomain", "Library/Logs/CrashReporter/WebKit-2023.ips"): ips},
    )
    recs = _run_extractor(root, tmp_path / "work", "crashlogs")
    assert any(r.raw["process"] == "WebKit.Networking" for r in recs)
